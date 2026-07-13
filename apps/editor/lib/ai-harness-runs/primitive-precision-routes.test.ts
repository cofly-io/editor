import { describe, expect, test } from 'bun:test'
import { precisionPartDeterministicRoute } from './primitive-precision-routes'

describe('precision primitive deterministic routes', () => {
  test('ignores negated target clauses for deterministic precision routes', () => {
    expect(
      precisionPartDeterministicRoute(
        'Generate an outdoor AC unit. Do not generate a pedestal fan, rotary screen, pump, or bicycle.',
        null,
      ),
    ).toBeUndefined()
    expect(
      precisionPartDeterministicRoute(
        'Generate a tower crane. Do not generate a mixer tank, storage tank, airplane, or bicycle.',
        null,
      )?.label,
    ).toBe('hammerhead tower crane')
  })

  test('routes robot arm prompts with negative guard rails to robot arm composer', () => {
    const prompt =
      '\u751f\u6210\u4e00\u4e2a\u5de5\u4e1a\u516d\u8f74\u673a\u5668\u81c2\uff0c\u53ea\u8981\u673a\u5668\u81c2\u672c\u4f53\uff0c\u4e0d\u8981\u5de5\u4f5c\u53f0\u3001\u63a7\u5236\u67dc\u3001\u62a4\u680f\u3002'

    expect(precisionPartDeterministicRoute(prompt, null)).toMatchObject({
      label: '6-axis industrial robot arm',
      family: 'robot_arm',
      args: {
        family: 'robot_arm',
        axisCount: 6,
        includeWorkcell: false,
        endEffector: 'tool-flange',
      },
    })
  })

  test('does not route outdoor AC unit fan grilles as pedestal fans', () => {
    const prompt =
      '\u751f\u6210\u4e00\u4e2a\u7a7a\u8c03\u5916\u673a\uff0c\u5e26\u98ce\u6247\u683c\u6805\u3001\u5916\u58f3\u3001\u4fa7\u9762\u6563\u70ed\u6805\u3001\u5e95\u5ea7\u652f\u811a'

    expect(precisionPartDeterministicRoute(prompt, null)?.family).not.toBe('fan')
  })

  test('routes construction tower cranes to a deterministic hammerhead topology', () => {
    const route = precisionPartDeterministicRoute('generate a construction tower crane', null)
    const parts = route?.args.parts as Array<Record<string, unknown>>

    expect(route).toMatchObject({
      label: 'hammerhead tower crane',
      family: 'generic',
      args: {
        family: 'generic',
        category: 'lifting equipment',
        requiredRoles: expect.arrayContaining([
          'tower_mast',
          'main_jib',
          'counter_jib',
          'trolley',
          'wire_rope',
          'hook_block',
          'pendant_cable',
        ]),
      },
    })
    expect(parts.map((part) => [part.id, part.kind, part.semanticRole])).toEqual(
      expect.arrayContaining([
        ['tower_mast', 'structural_tower_frame', 'tower_mast'],
        ['slewing_unit', 'generic_base', 'slewing_unit'],
        ['tower_peak', 'pyramid', 'tower_peak'],
        ['main_jib', 'generic_body', 'main_jib'],
        ['counter_jib', 'generic_body', 'counter_jib'],
        ['trolley', 'generic_body', 'trolley'],
        ['wire_rope', 'vertical_pole', 'wire_rope'],
        ['hook_block', 'generic_body', 'hook_block'],
      ]),
    )
    expect(parts.find((part) => part.id === 'tower_mast')).toMatchObject({
      primaryColor: '#facc15',
      metalColor: '#facc15',
      darkColor: '#facc15',
      accentColor: '#facc15',
    })
    expect(parts.find((part) => part.id === 'wire_rope')).toMatchObject({
      metalColor: '#111827',
    })
  })

  test('does not route gantry or overhead cranes through the tower crane shortcut', () => {
    expect(precisionPartDeterministicRoute('generate a gantry crane', null)?.label).not.toBe(
      'hammerhead tower crane',
    )
    expect(precisionPartDeterministicRoute('生成一个天车', null)?.label).not.toBe(
      'hammerhead tower crane',
    )
  })

  test('still routes explicit inspection platform ladder prompts deterministically', () => {
    const prompt =
      '\u751f\u6210\u4e00\u4e2a\u5de5\u4e1a\u68c0\u4fee\u5e73\u53f0\u722c\u68af\uff0c\u8981\u6709\u62a4\u680f\u548c\u8e0f\u68cd\u3002'

    expect(precisionPartDeterministicRoute(prompt, null)).toMatchObject({
      label: 'industrial platform ladder',
      family: 'generic',
      args: {
        parts: [
          expect.objectContaining({ kind: 'platform_ladder', semanticRole: 'access_platform' }),
        ],
      },
    })
  })

  test('routes industrial pedestal fan prompts to editable fan parts', () => {
    const route = precisionPartDeterministicRoute(
      '\u751f\u6210\u4e00\u4e2a\u7ea2\u8272\u5de5\u4e1a\u843d\u5730\u98ce\u6247\uff0c\u8981\u516d\u7247\u53ef\u7f16\u8f91\u6247\u53f6\u3002',
      null,
    )
    const parts = route?.args.parts as Array<Record<string, unknown>>

    expect(route).toMatchObject({
      label: 'industrial pedestal fan',
      family: 'fan',
      args: {
        family: 'fan',
        primaryColor: '#ef4444',
      },
    })
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'fan_blade',
          semanticRole: 'fan_blade',
          count: 6,
          includeHub: true,
        }),
        expect.objectContaining({
          kind: 'protective_grill',
          semanticRole: 'protective_grill',
          detailLevel: 'low',
        }),
      ]),
    )
  })

  test('routes complete water pump prompts deterministically with stable topology', () => {
    const plainRoute = precisionPartDeterministicRoute('\u751f\u6210\u4e00\u4e2a\u6c34\u6cf5', null)
    const whiteRoute = precisionPartDeterministicRoute(
      '\u751f\u6210\u4e00\u4e2a\u6c34\u6cf5\uff0c\u989c\u8272\u767d\u8272',
      null,
    )
    const plainParts = plainRoute?.args.parts as Array<Record<string, unknown>>
    const whiteParts = whiteRoute?.args.parts as Array<Record<string, unknown>>

    expect(plainRoute).toMatchObject({
      label: 'centrifugal water pump',
      family: 'pump',
      args: {
        family: 'pump',
        primaryColor: '#64748b',
      },
    })
    expect(whiteRoute).toMatchObject({
      label: 'centrifugal water pump',
      family: 'pump',
      args: {
        family: 'pump',
        primaryColor: '#f8fafc',
      },
    })
    expect(whiteParts.map((part) => [part.id, part.kind, part.semanticRole])).toEqual(
      plainParts.map((part) => [part.id, part.kind, part.semanticRole]),
    )
    expect(whiteParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'motor', position: [-0.28, 0.42, 0] }),
        expect.objectContaining({ id: 'volute', position: [0.24, 0.42, 0.04] }),
        expect.objectContaining({ id: 'inlet', position: [0.24, 0.42, 0.28], axis: 'z' }),
        expect.objectContaining({ id: 'outlet', position: [0.49, 0.5, 0.04], axis: 'x' }),
        expect.objectContaining({ id: 'flange_in', connectTo: 'inlet' }),
        expect.objectContaining({ id: 'flange_out', connectTo: 'outlet' }),
      ]),
    )
  })

  test('routes shaft plus three blade mixer prompts away from fan topology', () => {
    const route = precisionPartDeterministicRoute('生成一个搅拌器，一个杆子，下面是三片桨叶', null)
    const parts = route?.args.parts as Array<Record<string, unknown>>

    expect(route).toMatchObject({
      label: 'vertical shaft mixer impeller',
      family: 'generic',
      args: {
        category: 'mixer impeller component',
        requiredRoles: ['mixer_shaft', 'mixer_hub', 'mixer_blade'],
      },
    })
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mixer_shaft', kind: 'vertical_pole' }),
        expect.objectContaining({ id: 'mixer_hub', kind: 'circular_base' }),
        expect.objectContaining({ id: 'mixer_blades', kind: 'mixer_blades', count: 3 }),
      ]),
    )
    expect(parts.some((part) => part.kind === 'fan_blade')).toBe(false)
    expect(parts.some((part) => part.kind === 'protective_grill')).toBe(false)
  })

  test('routes English shaft mixer prompts away from fan topology', () => {
    const route = precisionPartDeterministicRoute(
      'Generate a vertical mixer shaft with three impeller paddles at the bottom.',
      null,
    )
    const parts = route?.args.parts as Array<Record<string, unknown>>

    expect(route).toMatchObject({
      label: 'vertical shaft mixer impeller',
      family: 'generic',
      args: {
        category: 'mixer impeller component',
        requiredRoles: ['mixer_shaft', 'mixer_hub', 'mixer_blade'],
      },
    })
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mixer_blades', kind: 'mixer_blades', count: 3 }),
      ]),
    )
    expect(parts.some((part) => part.kind === 'fan_blade')).toBe(false)
    expect(parts.some((part) => part.kind === 'protective_grill')).toBe(false)
  })
})
