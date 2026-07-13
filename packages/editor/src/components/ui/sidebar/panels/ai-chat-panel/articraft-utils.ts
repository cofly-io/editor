import { createModelNodes } from '@pascal-app/articraft-bridge/scene-converter'
import type { ArticraftJoint, ArticraftLink, ArticraftModelData } from '@pascal-app/articraft-bridge/types'
import type { ArticraftResult } from './types'

export function getArticraftMetadata(result: ArticraftResult, nodeName: string) {
  const linkName = nodeName.replace(/_v\d+$/, '')
  const joint = result.joints.find((candidate) => candidate.child === linkName)
  return {
    recordId: result.recordId,
    recordPath: result.recordPath,
    jointName: joint?.name ?? null,
    parentLink: joint?.parent ?? null,
    childLink: joint?.child ?? linkName,
  }
}

type BridgeJointMetadata = ReturnType<typeof createModelNodes>['jointMetadata'][string]

export function toSceneJointMetadata(jointMetadata: BridgeJointMetadata) {
  return {
    jointName: jointMetadata.jointName,
    jointType: jointMetadata.jointType,
    parentLink: jointMetadata.parentLink,
    childLink: jointMetadata.childLink,
    axis: jointMetadata.axis,
    origin: jointMetadata.origin,
    ...(jointMetadata.limits ? { limits: jointMetadata.limits } : {}),
    ...(jointMetadata.mimic ? { mimic: jointMetadata.mimic } : {}),
    currentValue: jointMetadata.currentValue,
  }
}

export function buildArticraftResultFromJobData(prompt: string, resultData: Record<string, unknown>) {
  const resultLinks = (resultData.links as Array<Record<string, unknown>>) ?? []
  const resultJoints = (resultData.joints as Array<Record<string, unknown>>) ?? []
  return {
    prompt,
    status: 'ready' as const,
    recordId: String(resultData.recordId ?? ''),
    recordPath: String(resultData.recordPath ?? ''),
    name: String(resultData.name ?? resultData.recordId ?? 'Articraft asset'),
    partCount: resultLinks.length,
    jointCount: resultJoints.length,
    links: resultLinks as unknown as ArticraftLink[],
    joints: resultJoints as unknown as ArticraftJoint[],
    data: resultData as unknown as ArticraftModelData,
  }
}
