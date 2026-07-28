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
})
