import { describe, expect, test } from 'bun:test'
import { summarizeGeometryAgentSourceChange } from './source-change-feedback'

const SOURCE = `
equipment('belt_conveyor', { id: 'conveyor', length: 6 });
boxFrame({ id: 'frame', length: 6, width: 0.9, height: 0.8 });
belt({ id: 'belt', length: 6, width: 0.72 });
rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 12 });
guardCover({ id: 'top_guard_cover', target: 'belt', height: 0.55, clearance: 0.08 });
motor({ id: 'drive_motor', target: 'belt', side: 'right', position: 'rear' });
`

describe('geometry-agent source change feedback', () => {
  test('summarizes parameter changes on existing semantic calls', () => {
    const feedback = summarizeGeometryAgentSourceChange({
      beforeSource: SOURCE,
      afterSource: SOURCE.replace('height: 0.55', 'height: 0.75').replace(
        'clearance: 0.08',
        'clearance: 0.12',
      ),
      instruction: '罩子大一点',
    })

    expect(feedback.changed).toEqual([
      {
        id: 'top_guard_cover',
        functionName: 'guardCover',
        changedParams: [
          { name: 'clearance', before: '0.08', after: '0.12' },
          { name: 'height', before: '0.55', after: '0.75' },
        ],
      },
    ])
    expect(feedback.unchangedImportantIds).toContain('belt')
    expect(feedback.unchangedImportantIds).toContain('drive_motor')
    expect(feedback.text).toContain('guardCover(top_guard_cover)')
    expect(feedback.text).toContain('保持不变')
  })

  test('summarizes added semantic components', () => {
    const feedback = summarizeGeometryAgentSourceChange({
      beforeSource: SOURCE,
      afterSource: `${SOURCE}\ninspectionDoor({ id: 'right_doors', target: 'frame', side: 'right', count: 2 });`,
      instruction: '右侧加两个检修门',
    })

    expect(feedback.added).toEqual([{ id: 'right_doors', functionName: 'inspectionDoor' }])
    expect(feedback.text).toContain('新增：inspectionDoor(right_doors)')
  })

  test('tracks broader industrial SDK source changes', () => {
    const beforeSource = `${SOURCE}
controlCabinet({ id: 'control_cabinet', target: 'frame', side: 'right', width: 0.7 });
pipeRun({ id: 'process_pipe', from: [-1, 1, 0], to: [1, 1, 0], radius: 0.05 });
`
    const feedback = summarizeGeometryAgentSourceChange({
      beforeSource,
      afterSource: beforeSource
        .replace('width: 0.7 });', 'width: 0.9 });')
        .replace('radius: 0.05', 'radius: 0.08'),
      instruction: 'make the control cabinet wider and pipe larger',
    })

    expect(feedback.changed.map((change) => [change.functionName, change.id])).toEqual([
      ['controlCabinet', 'control_cabinet'],
      ['pipeRun', 'process_pipe'],
    ])
  })

  test('tracks drivetrain SDK source additions and changes', () => {
    const beforeSource = `${SOURCE}
gearbox({ id: 'gearbox', target: 'belt', side: 'right', position: 'rear', height: 0.36 });
`
    const feedback = summarizeGeometryAgentSourceChange({
      beforeSource,
      afterSource: `${beforeSource.replace('height: 0.36', 'height: 0.42')}
bearingBlock({ id: 'rear_bearing', target: 'belt', side: 'right', position: 'rear' });
`,
      instruction: 'make the gearbox taller and add a rear bearing block',
    })

    expect(feedback.changed.map((change) => [change.functionName, change.id])).toEqual([
      ['gearbox', 'gearbox'],
    ])
    expect(feedback.added).toEqual([{ id: 'rear_bearing', functionName: 'bearingBlock' }])
    expect(feedback.unchangedImportantIds).toContain('belt')
  })

  test('tracks platform access SDK additions and changes', () => {
    const beforeSource = `${SOURCE}
platform({ id: 'service_platform', target: 'frame', side: 'front', width: 0.9 });
`
    const feedback = summarizeGeometryAgentSourceChange({
      beforeSource,
      afterSource: `${beforeSource.replace(
        "platform({ id: 'service_platform', target: 'frame', side: 'front', width: 0.9 });",
        "platform({ id: 'service_platform', target: 'frame', side: 'front', width: 1.1 });",
      )}
ladder({ id: 'access_ladder', target: 'service_platform', side: 'front' });
handrail({ id: 'platform_handrail', target: 'service_platform', side: 'all' });
`,
      instruction: 'make the platform wider and add ladder with handrail',
    })

    expect(feedback.changed.map((change) => [change.functionName, change.id])).toEqual([
      ['platform', 'service_platform'],
    ])
    expect(feedback.added).toEqual([
      { id: 'access_ladder', functionName: 'ladder' },
      { id: 'platform_handrail', functionName: 'handrail' },
    ])
  })

  test('tracks agitator tank source changes', () => {
    const beforeSource = `
agitatorTank({ id: 'reactor', diameter: 1.5, height: 3.6, bladeCount: 4 });
`
    const feedback = summarizeGeometryAgentSourceChange({
      beforeSource,
      afterSource: beforeSource
        .replace('height: 3.6', 'height: 4.2')
        .replace('bladeCount: 4', 'bladeCount: 6'),
      instruction: 'make the reactor taller and use six blades',
    })

    expect(feedback.changed).toEqual([
      {
        id: 'reactor',
        functionName: 'agitatorTank',
        changedParams: [
          { name: 'bladeCount', before: '4', after: '6' },
          { name: 'height', before: '3.6', after: '4.2' },
        ],
      },
    ])
    expect(feedback.text).toContain('agitatorTank(reactor)')
  })

  test('tracks blower package source changes', () => {
    const beforeSource = `
blowerPackage({ id: 'blower', length: 3.2, width: 1.3, fanDiameter: 0.95 });
`
    const feedback = summarizeGeometryAgentSourceChange({
      beforeSource,
      afterSource: beforeSource
        .replace('fanDiameter: 0.95', 'fanDiameter: 1.1')
        .replace('width: 1.3', 'width: 1.45'),
      instruction: 'make the blower package wider and increase fan diameter',
    })

    expect(feedback.changed).toEqual([
      {
        id: 'blower',
        functionName: 'blowerPackage',
        changedParams: [
          { name: 'fanDiameter', before: '0.95', after: '1.1' },
          { name: 'width', before: '1.3', after: '1.45' },
        ],
      },
    ])
    expect(feedback.text).toContain('blowerPackage(blower)')
  })
})
