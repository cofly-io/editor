import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import { stripNegatedTargetClauses } from './primitive-run-context'

export function precisionPartDeterministicRoute(
  userPrompt: string,
  revisionTarget: GeneratedGeometryArtifact | null,
):
  | {
      label: string
      family: string
      args: Record<string, unknown>
    }
  | undefined {
  if (revisionTarget) return undefined
  const text = stripNegatedTargetClauses(userPrompt).toLowerCase()
  const robotArmIntent =
    /(\u673a\u5668\u81c2|\u673a\u68b0\u81c2|\u516d\u8f74|\u4e03\u8f74|\u56db\u8f74|robot[_\s-]?arm|industrial[_\s-]?robot|six[_\s-]?axis|6[_\s-]?axis|seven[_\s-]?axis|7[_\s-]?axis|four[_\s-]?axis|4[_\s-]?axis|fanuc|kuka|abb)/i.test(
      text,
    )
  if (robotArmIntent) {
    const axisCount = robotArmAxisCountFromPrompt(text)
    return {
      label: `${axisCount}-axis industrial robot arm`,
      family: 'robot_arm',
      args: {
        name: `${axisCount}-axis industrial robot arm`,
        family: 'robot_arm',
        axisCount,
        includeWorkcell: false,
        height: 2.2,
        endEffector: 'tool-flange',
      },
    }
  }

  const pumpIntent =
    /(\u6c34\u6cf5|\u79bb\u5fc3\u6cf5|pump|centrifugal[_\s-]?pump|water[_\s-]?pump)/i.test(text) &&
    !/(\u53f6\u8f6e|impeller|blade|flange|port|inlet|outlet)/i.test(text)
  if (pumpIntent) {
    const primaryColor = machinePrimaryColorFromPrompt(text, '#64748b')
    return {
      label: 'centrifugal water pump',
      family: 'pump',
      args: {
        name: 'centrifugal water pump',
        family: 'pump',
        category: 'industrial pump',
        primaryColor,
        metalColor: '#cbd5e1',
        requiredRoles: [
          'support_base',
          'drive_motor',
          'volute_casing',
          'inlet_port',
          'outlet_port',
        ],
        parts: [
          {
            id: 'base',
            kind: 'skid_base',
            semanticRole: 'support_base',
          },
          {
            id: 'motor',
            kind: 'ribbed_motor_body',
            semanticRole: 'drive_motor',
            position: [-0.28, 0.42, 0],
            length: 0.55,
            primaryColor,
            metalColor: '#cbd5e1',
          },
          {
            id: 'volute',
            kind: 'volute_casing',
            semanticRole: 'volute_casing',
            position: [0.24, 0.42, 0.04],
            radius: 0.22,
            depth: 0.16,
            primaryColor,
            metalColor: '#cbd5e1',
          },
          {
            id: 'inlet',
            kind: 'inlet_port',
            semanticRole: 'inlet_port',
            position: [0.24, 0.42, 0.28],
            axis: 'z',
            radius: 0.07,
            metalColor: '#cbd5e1',
          },
          {
            id: 'outlet',
            kind: 'outlet_port',
            semanticRole: 'outlet_port',
            position: [0.49, 0.5, 0.04],
            axis: 'x',
            radius: 0.06,
            metalColor: '#cbd5e1',
          },
          {
            id: 'flange_in',
            kind: 'flange_ring',
            semanticRole: 'inlet_flange',
            connectTo: 'inlet',
            connectPoint: 'open',
            metalColor: '#cbd5e1',
          },
          {
            id: 'flange_out',
            kind: 'flange_ring',
            semanticRole: 'outlet_flange',
            connectTo: 'outlet',
            connectPoint: 'open',
            metalColor: '#cbd5e1',
          },
          {
            id: 'control',
            kind: 'control_box',
            semanticRole: 'control_box',
            position: [-0.28, 0.62, 0.2],
          },
        ],
      },
    }
  }

  const mixerImpellerIntent =
    /(\u6405\u62cc|\u6df7\u5408|\u6868\u53f6|\u53f6\u7247|\u53f6\u8f6e|mixer|stirrer|agitator|impeller|paddle)/i.test(
      text,
    ) &&
    /(\u6746|\u8f74|shaft|rod|pole)/i.test(text) &&
    !/(\u98ce\u6247|\u7535\u98ce\u6247|\u843d\u5730\u6247|fan|pedestal[_\s-]?fan)/i.test(text)
  if (mixerImpellerIntent) {
    const bladeCount = mixerBladeCountFromPrompt(text)
    const metalColor = machinePrimaryColorFromPrompt(text, '#c0c0c0')
    return {
      label: 'vertical shaft mixer impeller',
      family: 'generic',
      args: {
        name: 'vertical shaft mixer impeller',
        family: 'generic',
        category: 'mixer impeller component',
        geometryBrief:
          'vertical mixer shaft with a bottom hub and pitched three-blade mixing impeller; not a fan, no pedestal, no motor housing, no protective grille',
        requiredRoles: ['mixer_shaft', 'mixer_hub', 'mixer_blade'],
        detail: 'high',
        parts: [
          {
            id: 'mixer_hub',
            kind: 'circular_base',
            semanticRole: 'mixer_hub',
            radius: 0.055,
            height: 0.055,
            primaryColor: metalColor,
            position: [0, 0.06, 0],
          },
          {
            id: 'mixer_shaft',
            kind: 'vertical_pole',
            semanticRole: 'mixer_shaft',
            radius: 0.022,
            height: 0.82,
            metalColor,
            position: [0, 0.49, 0],
          },
          {
            id: 'mixer_blades',
            kind: 'mixer_blades',
            semanticRole: 'mixer_blade',
            count: bladeCount,
            length: 0.34,
            width: 0.17,
            depth: 0.018,
            bladePitch: 0.22,
            curvature: 0.08,
            bladeShape: 'taiji_half',
            hubRadius: 0.055,
            primaryColor: metalColor,
            position: [0, 0.06, 0],
          },
        ],
      },
    }
  }

  const towerCraneIntent =
    /(\u5854\u540a|tower[_\s-]?crane|hammerhead[_\s-]?crane|construction[_\s-]?crane)/i.test(
      text,
    ) &&
    !/(\u9f99\u95e8\u540a|\u5929\u8f66|\u884c\u8f66|gantry|overhead|bridge[_\s-]?crane)/i.test(text)
  if (towerCraneIntent) {
    const primaryColor = machinePrimaryColorFromPrompt(text, '#facc15')
    const darkColor = '#111827'
    const metalColor = '#475569'
    return {
      label: 'hammerhead tower crane',
      family: 'generic',
      args: {
        name: 'hammerhead tower crane',
        family: 'generic',
        category: 'lifting equipment',
        __precisionPartRoute: 'tower_crane',
        __directPartComposer: true,
        geometryBrief:
          'construction-site hammerhead tower crane with lattice mast, slewing unit, operator cab, tower peak, long main jib, shorter counter jib, counterweight, trolley, vertical wire rope, hook block, and pendant cables',
        requiredRoles: [
          'tower_mast',
          'slewing_unit',
          'operator_cab',
          'tower_peak',
          'main_jib',
          'counter_jib',
          'counterweight',
          'trolley',
          'wire_rope',
          'hook_block',
          'pendant_cable',
        ],
        detail: 'high',
        primaryColor,
        metalColor,
        darkColor,
        parts: [
          {
            id: 'tower_mast',
            kind: 'structural_tower_frame',
            semanticRole: 'tower_mast',
            name: 'lattice tower mast',
            position: [0, 2.9, 0],
            length: 0.72,
            width: 0.72,
            height: 5.8,
            levelCount: 4,
            bayCount: 1,
            thickness: 0.045,
            externalStairs: false,
            includeDiagonalBraces: true,
            primaryColor,
            metalColor: primaryColor,
            darkColor: primaryColor,
            accentColor: primaryColor,
          },
          {
            id: 'slewing_unit',
            kind: 'generic_base',
            semanticRole: 'slewing_unit',
            name: 'slewing ring turntable',
            position: [0, 5.98, 0],
            length: 1.0,
            width: 0.82,
            height: 0.18,
            primaryColor,
            darkColor,
          },
          {
            id: 'operator_cab',
            kind: 'generic_body',
            semanticRole: 'operator_cab',
            name: 'operator cab',
            position: [0.55, 6.18, 0.36],
            length: 0.55,
            width: 0.42,
            height: 0.42,
            primaryColor: '#fef3c7',
            cornerRadius: 0.035,
          },
          {
            id: 'tower_peak',
            kind: 'pyramid',
            semanticRole: 'tower_peak',
            name: 'tower peak apex',
            position: [0, 6.68, 0],
            length: 0.42,
            width: 0.42,
            height: 0.85,
            primaryColor,
          },
          {
            id: 'main_jib',
            kind: 'generic_body',
            semanticRole: 'main_jib',
            name: 'long main lifting jib',
            position: [3.45, 6.35, 0],
            length: 6.9,
            width: 0.14,
            height: 0.14,
            primaryColor,
          },
          {
            id: 'counter_jib',
            kind: 'generic_body',
            semanticRole: 'counter_jib',
            name: 'short counter jib',
            position: [-1.55, 6.35, 0],
            length: 3.1,
            width: 0.16,
            height: 0.14,
            primaryColor,
          },
          {
            id: 'counterweight',
            kind: 'generic_body',
            semanticRole: 'counterweight',
            name: 'counterweight block stack',
            position: [-2.95, 6.22, 0],
            length: 0.52,
            width: 0.62,
            height: 0.55,
            primaryColor: '#6b7280',
            cornerRadius: 0.025,
          },
          {
            id: 'trolley',
            kind: 'generic_body',
            semanticRole: 'trolley',
            name: 'jib trolley carriage',
            position: [4.75, 6.17, 0],
            length: 0.42,
            width: 0.28,
            height: 0.18,
            primaryColor: darkColor,
            cornerRadius: 0.02,
          },
          {
            id: 'wire_rope',
            kind: 'vertical_pole',
            semanticRole: 'wire_rope',
            name: 'vertical hoist wire rope',
            position: [4.75, 4.88, 0],
            radius: 0.014,
            height: 2.42,
            metalColor: darkColor,
          },
          {
            id: 'hook_block',
            kind: 'generic_body',
            semanticRole: 'hook_block',
            name: 'hanging hook block',
            position: [4.75, 3.55, 0],
            length: 0.25,
            width: 0.18,
            height: 0.38,
            primaryColor: darkColor,
            cornerRadius: 0.02,
          },
          {
            id: 'main_pendant',
            kind: 'generic_body',
            semanticRole: 'pendant_cable',
            name: 'main jib pendant cable',
            position: [2.05, 6.62, 0],
            rotation: [0, 0, -0.12],
            length: 4.15,
            width: 0.035,
            height: 0.035,
            primaryColor: darkColor,
          },
          {
            id: 'counter_pendant',
            kind: 'generic_body',
            semanticRole: 'pendant_cable',
            name: 'counter jib pendant cable',
            position: [-0.95, 6.62, 0],
            rotation: [0, 0, 0.32],
            length: 1.95,
            width: 0.035,
            height: 0.035,
            primaryColor: darkColor,
          },
        ],
      },
    }
  }

  const fanIntent =
    /(\u5de5\u4e1a\u98ce\u6247|\u843d\u5730\u6247|\u7535\u98ce\u6247|\u98ce\u6247|industrial[_\s-]?(pedestal[_\s-]?)?fan|standing[_\s-]?fan|pedestal[_\s-]?fan)/i.test(
      text,
    ) &&
    !/(fanuc|\u7a7a\u8c03|\u5916\u673a|\u5ba4\u5916\u673a|air[_\s-]?condition|ac[_\s-]?(outdoor|condenser)|outdoor[_\s-]?unit|condenser[_\s-]?unit)/i.test(
      text,
    )
  if (fanIntent) {
    const primaryColor = fanPrimaryColorFromPrompt(text)
    const bladeCount = fanBladeCountFromPrompt(text)
    return {
      label: 'industrial pedestal fan',
      family: 'fan',
      args: {
        name: 'industrial pedestal fan',
        family: 'fan',
        primaryColor,
        metalColor: '#cbd5e1',
        parts: [
          {
            id: 'base',
            kind: 'circular_base',
            semanticRole: 'fan_base',
            radius: 0.28,
            height: 0.06,
            primaryColor: '#111827',
          },
          {
            id: 'pole',
            kind: 'vertical_pole',
            semanticRole: 'fan_pole',
            alignAbove: 'base',
            radius: 0.024,
            height: 1.05,
            metalColor: '#111827',
          },
          {
            id: 'yoke',
            kind: 'support_bracket',
            semanticRole: 'fan_yoke',
            alignAbove: 'pole',
            width: 0.18,
            height: 0.14,
            depth: 0.14,
            metalColor: '#111827',
          },
          {
            id: 'motor',
            kind: 'motor_housing',
            semanticRole: 'motor_housing',
            alignAbove: 'yoke',
            radius: 0.13,
            depth: 0.18,
            primaryColor,
          },
          {
            id: 'blades',
            kind: 'fan_blade',
            semanticRole: 'fan_blade',
            centeredOn: 'motor',
            count: bladeCount,
            length: 0.32,
            width: 0.1,
            thickness: 0.012,
            pitch: 0.28,
            primaryColor,
            includeHub: true,
          },
          {
            id: 'grill',
            kind: 'protective_grill',
            semanticRole: 'protective_grill',
            centeredOn: 'motor',
            side: 'front',
            radius: 0.37,
            depth: 0.08,
            detailLevel: 'low',
          },
        ],
      },
    }
  }

  const tankIntent =
    /(\u5367\u5f0f|\u50a8\u7f50|\u538b\u529b\u7f50|\u538b\u529b\u5bb9\u5668|storage[_\s-]?tank|pressure[_\s-]?(tank|vessel)|horizontal[_\s-]?(tank|vessel))/i.test(
      text,
    ) && !/(\u53cd\u5e94\u91dc|\u53cd\u5e94\u5668|reactor|agitator|stirred)/i.test(text)
  if (tankIntent) {
    return {
      label: 'horizontal pressure tank',
      family: 'tank',
      args: {
        name: 'horizontal pressure storage tank',
        family: 'generic',
        parts: [
          {
            kind: 'cylindrical_tank',
            semanticRole: 'vessel_shell',
            axis: 'x',
            length: 2.2,
            radius: 0.34,
          },
        ],
      },
    }
  }

  const platformIntent =
    !robotArmIntent &&
    /(\u68c0\u4fee\u5e73\u53f0|\u5de5\u4e1a\u5e73\u53f0|\u722c\u68af|access[_\s-]?platform|inspection[_\s-]?platform|platform[_\s-]?ladder)/i.test(
      text,
    ) &&
    !/(\u50a8\u7f50|\u538b\u529b\u7f50|\u538b\u529b\u5bb9\u5668|\u53cd\u5e94\u91dc|\u53cd\u5e94\u5668|storage[_\s-]?tank|pressure[_\s-]?(tank|vessel)|reactor|agitator|stirred)/i.test(
      text,
    )
  if (platformIntent) {
    return {
      label: 'industrial platform ladder',
      family: 'generic',
      args: {
        name: 'industrial inspection platform ladder',
        family: 'generic',
        parts: [
          {
            kind: 'platform_ladder',
            semanticRole: 'access_platform',
            length: 1.2,
            width: 0.7,
            height: 1.6,
            count: 7,
          },
        ],
      },
    }
  }

  return undefined
}

function robotArmAxisCountFromPrompt(text: string): number {
  if (/(seven[_\s-]?axis|7[_\s-]?axis|\u4e03\u8f74)/i.test(text)) return 7
  if (/(six[_\s-]?axis|6[_\s-]?axis|\u516d\u8f74|fanuc|kuka|abb)/i.test(text)) return 6
  if (/(five[_\s-]?axis|5[_\s-]?axis|\u4e94\u8f74)/i.test(text)) return 5
  if (/(four[_\s-]?axis|4[_\s-]?axis|\u56db\u8f74|scara)/i.test(text)) return 4
  if (/(three[_\s-]?axis|3[_\s-]?axis|\u4e09\u8f74)/i.test(text)) return 3
  return 6
}

function fanBladeCountFromPrompt(text: string): number {
  if (/(\u516d\u7247|\u516d\u53f6|six|6)/i.test(text)) return 6
  if (/(\u4e94\u7247|\u4e94\u53f6|five|5)/i.test(text)) return 5
  if (/(\u56db\u7247|\u56db\u53f6|four|4)/i.test(text)) return 4
  if (/(\u4e09\u7247|\u4e09\u53f6|three|3)/i.test(text)) return 3
  return 5
}

function machinePrimaryColorFromPrompt(text: string, fallback: string): string {
  if (/(\u84dd|blue)/i.test(text)) return '#3b82f6'
  if (/(\u7ea2|red)/i.test(text)) return '#ef4444'
  if (/(\u9ed1|black)/i.test(text)) return '#111827'
  if (/(\u767d|white)/i.test(text)) return '#f8fafc'
  if (/(\u9ec4|yellow)/i.test(text)) return '#facc15'
  return fallback
}

function fanPrimaryColorFromPrompt(text: string): string {
  return machinePrimaryColorFromPrompt(text, '#ef4444')
}

function mixerBladeCountFromPrompt(text: string): number {
  if (/(\u516d\u7247|\u516d\u53f6|six|6)/i.test(text)) return 6
  if (/(\u4e94\u7247|\u4e94\u53f6|five|5)/i.test(text)) return 5
  if (/(\u56db\u7247|\u56db\u53f6|four|4)/i.test(text)) return 4
  if (/(\u4e09\u7247|\u4e09\u53f6|three|3)/i.test(text)) return 3
  return 3
}
