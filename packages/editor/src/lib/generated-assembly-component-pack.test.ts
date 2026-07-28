import { describe, expect, it } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import {
  createGeneratedAssemblyComponentPack,
  generatedAssemblyThumbnailCacheKey,
  isGeneratedAssemblyComponentPack,
} from './generated-assembly-component-pack'
import { buildGeneratedAssemblyNodes } from './generated-geometry-placement'

const ir: AssemblyIR = {
  schemaVersion: 1,
  generator: { sourceHash: 'source', paramsHash: 'params', apiVersion: '1.0.0' },
  parts: [],
  constraints: [],
}

describe('generated assembly component pack', () => {
  it('preserves editable generator truth and canonical IR', () => {
    const { rootNode } = buildGeneratedAssemblyNodes(ir, {
      generator: { ...ir.generator, irHash: 'ir', source: 'part()', params: { width: 2 } },
    })
    const pack = createGeneratedAssemblyComponentPack({
      id: 'pump',
      name: 'Pump',
      root: rootNode,
      ir,
    })
    expect(isGeneratedAssemblyComponentPack(JSON.parse(JSON.stringify(pack)))).toBe(true)
    expect(pack.generator.source).toBe('part()')
  })

  it('invalidates thumbnail cache when any key component changes', () => {
    const key = generatedAssemblyThumbnailCacheKey('ir', 'material', 'v1')
    expect(generatedAssemblyThumbnailCacheKey('ir2', 'material', 'v1')).not.toBe(key)
    expect(generatedAssemblyThumbnailCacheKey('ir', 'material2', 'v1')).not.toBe(key)
    expect(generatedAssemblyThumbnailCacheKey('ir', 'material', 'v2')).not.toBe(key)
  })
})
