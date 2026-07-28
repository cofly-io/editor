import { describe, expect, test } from 'bun:test'
import { reviewGeometryAgentPatchLocality } from './source-patch-locality'

const CONVEYOR_SOURCE = `
equipment('belt_conveyor', { id: 'conveyor', length: 6 });
boxFrame({ id: 'frame', length: 6, width: 0.9, height: 0.8 });
belt({ id: 'belt', length: 6, width: 0.72 });
rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 12 });
guardCover({ id: 'top_guard_cover', target: 'belt', height: 0.55 });
motor({ id: 'drive_motor', target: 'belt', side: 'right', position: 'rear' });
nameplate({ id: 'nameplate', target: 'frame', text: 'BC-01' });
`

describe('geometry-agent source patch locality', () => {
  test('allows local guard cover parameter edits while preserving unrelated ids', () => {
    const review = reviewGeometryAgentPatchLocality({
      instruction: '罩子大一点',
      beforeSource: CONVEYOR_SOURCE,
      afterSource: CONVEYOR_SOURCE.replace('height: 0.55', 'height: 0.75'),
    })

    expect(review.passed).toBe(true)
    expect(review.changedIds).toEqual(['top_guard_cover'])
    expect(review.removedIds).toEqual([])
  })

  test('rejects local edits that rewrite unrelated equipment calls', () => {
    const review = reviewGeometryAgentPatchLocality({
      instruction: '罩子大一点',
      beforeSource: CONVEYOR_SOURCE,
      afterSource: CONVEYOR_SOURCE.replace('width: 0.72', 'width: 1.2').replace(
        'height: 0.55',
        'height: 0.75',
      ),
    })

    expect(review.passed).toBe(false)
    expect(review.issues.map((issue) => issue.code)).toContain(
      'geometry_agent_changed_unrelated_call',
    )
    expect(review.changedIds).toEqual(['belt', 'top_guard_cover'])
  })

  test('allows adding inspection doors without changing the existing conveyor', () => {
    const review = reviewGeometryAgentPatchLocality({
      instruction: '右侧加两个检修门',
      beforeSource: CONVEYOR_SOURCE,
      afterSource: `${CONVEYOR_SOURCE}\ninspectionDoor({ id: 'right_doors', target: 'frame', side: 'right', count: 2 });`,
    })

    expect(review.passed).toBe(true)
    expect(review.addedIds).toEqual(['right_doors'])
  })

  test('allows local edits to broader industrial SDK calls', () => {
    const source = `${CONVEYOR_SOURCE}
controlCabinet({ id: 'control_cabinet', target: 'frame', side: 'right', width: 0.7 });
pipeRun({ id: 'process_pipe', from: [-1, 1, 0], to: [1, 1, 0], radius: 0.05 });
`
    const review = reviewGeometryAgentPatchLocality({
      instruction: 'make the control cabinet wider and pipe larger',
      beforeSource: source,
      afterSource: source
        .replace('width: 0.7 });', 'width: 0.9 });')
        .replace('radius: 0.05', 'radius: 0.08'),
    })

    expect(review.passed).toBe(true)
    expect(review.changedIds).toEqual(['control_cabinet', 'process_pipe'])
  })

  test('allows adding gearbox and bearing block as local drivetrain details', () => {
    const review = reviewGeometryAgentPatchLocality({
      instruction: 'add a gearbox and a bearing block near the rear drive shaft',
      beforeSource: CONVEYOR_SOURCE,
      afterSource: `${CONVEYOR_SOURCE}
gearbox({ id: 'gearbox', target: 'belt', side: 'right', position: 'rear' });
bearingBlock({ id: 'rear_bearing', target: 'belt', side: 'right', position: 'rear' });
`,
    })

    expect(review.passed).toBe(true)
    expect(review.allowedFunctions).toEqual(expect.arrayContaining(['gearbox', 'bearingBlock']))
    expect(review.addedIds).toEqual(['gearbox', 'rear_bearing'])
  })

  test('allows adding platform access details as local serviceability details', () => {
    const review = reviewGeometryAgentPatchLocality({
      instruction: 'add a service platform with ladder and handrail',
      beforeSource: CONVEYOR_SOURCE,
      afterSource: `${CONVEYOR_SOURCE}
platform({ id: 'service_platform', target: 'frame', side: 'front' });
ladder({ id: 'access_ladder', target: 'service_platform', side: 'front' });
handrail({ id: 'platform_handrail', target: 'service_platform', side: 'all' });
`,
    })

    expect(review.passed).toBe(true)
    expect(review.allowedFunctions).toEqual(
      expect.arrayContaining(['platform', 'ladder', 'handrail']),
    )
    expect(review.addedIds).toEqual(['access_ladder', 'platform_handrail', 'service_platform'])
  })

  test('allows local edits to reactor agitator tank calls', () => {
    const source = `
agitatorTank({ id: 'reactor', diameter: 1.5, height: 3.6, bladeCount: 4 });
`
    const review = reviewGeometryAgentPatchLocality({
      instruction: 'make the reactor taller and use six impeller blades',
      beforeSource: source,
      afterSource: source
        .replace('height: 3.6', 'height: 4.2')
        .replace('bladeCount: 4', 'bladeCount: 6'),
    })

    expect(review.passed).toBe(true)
    expect(review.allowedFunctions).toContain('agitatorTank')
    expect(review.changedIds).toEqual(['reactor'])
  })

  test('allows local edits to blower package calls', () => {
    const source = `
blowerPackage({ id: 'blower', length: 3.2, width: 1.3, fanDiameter: 0.95 });
`
    const review = reviewGeometryAgentPatchLocality({
      instruction: 'make the blower fan diameter larger and keep the silencer',
      beforeSource: source,
      afterSource: source.replace('fanDiameter: 0.95', 'fanDiameter: 1.1'),
    })

    expect(review.passed).toBe(true)
    expect(review.allowedFunctions).toEqual(
      expect.arrayContaining(['centrifugalFan', 'blowerPackage']),
    )
    expect(review.changedIds).toEqual(['blower'])
  })
})
