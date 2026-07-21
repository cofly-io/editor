import { expect, test } from 'bun:test'
import { createSuposRuntimePackageMetadata } from './supos-runtime-package'

test('creates metadata consistent with the supOS runtime image and route', () => {
  const result = createSuposRuntimePackageMetadata({ sceneId: 'aB-cd_1', sceneName: 'Line A' })
  expect(result.appId).toBe('pascalabcd1')
  expect(result.image).toBe('pascalabcd1-frontend:latest')
  expect(result.workloadYaml).toContain(`image: ${result.image}`)
  expect(result.workloadYaml).toContain(`BASE_URL: "${result.baseUrl}"`)
  expect(result.workloadYaml).toContain('stripPath: true')
  expect(result.menuYaml).toContain(`url: ${result.baseUrl}`)
})
