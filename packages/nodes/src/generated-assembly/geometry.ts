import { Group } from 'three'
import type { GeneratedAssemblyNode } from './schema'

export function buildGeneratedAssemblyGeometry(_node: GeneratedAssemblyNode): Group {
  return new Group()
}
