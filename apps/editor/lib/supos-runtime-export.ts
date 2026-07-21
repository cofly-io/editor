import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { SceneGraph } from '@pascal-app/editor/scene'
import { createSuposRuntimePackageMetadata } from './supos-runtime-package'

const execFileAsync = promisify(execFile)

export async function exportSuposRuntime(input: {
  sceneId: string
  sceneName: string
  graph: SceneGraph
  onProgress?: (message: string, progress: number) => void
}) {
  const sourceRoot = process.env.PASCAL_RUNTIME_EXPORT_SOURCE ?? process.cwd()
  const metadata = createSuposRuntimePackageMetadata(input)
  const directory = await mkdtemp(join(tmpdir(), 'pascal-supos-'))
  const buildContext = join(directory, 'context')
  const imageTar = join(directory, 'images', `frontend-${metadata.appId}.tar`)
  const packagePath = join(directory, `${metadata.appId}.zip`)
  const tag = metadata.image
  const report = (message: string, progress: number) => input.onProgress?.(message, progress)

  try {
    report('\u6b63\u5728\u51c6\u5907\u5bfc\u51fa\u6587\u4ef6\u2026', 5)
    await Promise.all([
      mkdir(join(directory, 'images')),
      mkdir(join(directory, 'metadata')),
      cp(sourceRoot, buildContext, {
        recursive: true,
        filter: (source) =>
          !/[/\\\\](?:\.git|node_modules|\.next|test-results)(?:[/\\\\]|$)/.test(source),
      }),
    ])
    report(
      '\u6b63\u5728\u5199\u5165\u573a\u666f\u914d\u7f6e\u548c supOS \u5143\u6570\u636e\u2026',
      12,
    )
    await Promise.all([
      writeFile(
        join(buildContext, 'apps', 'runtime', 'public', 'runtime-bundle', 'scene.json'),
        JSON.stringify(input.graph),
      ),
      writeFile(join(directory, 'app.yaml'), metadata.appYaml),
      writeFile(join(directory, 'workload.yaml'), metadata.workloadYaml),
      writeFile(join(directory, 'metadata', 'menu.yaml'), metadata.menuYaml),
      writeFile(join(directory, 'metadata', 'UNS.json'), metadata.unsJson),
    ])
    report(
      '\u6b63\u5728\u6784\u5efa runtime Docker \u955c\u50cf\uff08\u9996\u6b21\u53ef\u80fd\u9700\u8981\u6570\u5206\u949f\uff09\u2026',
      20,
    )
    await execFileAsync(
      'docker',
      [
        'build',
        '--build-arg',
        `RUNTIME_BASE_PATH=${metadata.baseUrl}`,
        '--tag',
        tag,
        '--file',
        'apps/runtime/Dockerfile',
        '.',
      ],
      {
        cwd: buildContext,
        env: { ...process.env, DOCKER_BUILDKIT: '0' },
        maxBuffer: 10 * 1024 * 1024,
      },
    )
    report('\u6b63\u5728\u4fdd\u5b58 Docker \u955c\u50cf\u2026', 80)
    await execFileAsync('docker', ['save', '--output', imageTar, tag], {
      maxBuffer: 10 * 1024 * 1024,
    })
    report('\u6b63\u5728\u538b\u7f29 supOS \u5b89\u88c5\u5305\u2026', 92)
    await execFileAsync(
      'zip',
      ['-qr', packagePath, 'app.yaml', 'workload.yaml', 'images', 'metadata'],
      { cwd: directory },
    )
    report(
      '\u5b89\u88c5\u5305\u5df2\u751f\u6210\uff0c\u6b63\u5728\u51c6\u5907\u4e0b\u8f7d\u2026',
      98,
    )
    return { fileName: `${metadata.appId}.zip`, body: await readFile(packagePath) }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
