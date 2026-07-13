'use client'

const GEOMETRY_BRIEF_SCHEMA = {
  type: 'object',
  description:
    'Internal geometry brief distilled from the analysis. Declare object family, dimensions, required semantic roles, validation targets, and assumptions. Do not show this JSON to the user.',
  properties: {
    category: {
      type: 'string',
      description:
        'Semantic family such as vehicle, bicycle, fan, pump, conveyor, desk, electrical, pipe_system, or generic.',
    },
    units: { type: 'string', description: 'Use "m" for meters.' },
    coordinateConvention: {
      type: 'string',
      description: 'Coordinate convention, e.g. +X length/front-back, +Y up, +Z width.',
    },
    expectedDimensions: {
      type: 'object',
      properties: {
        length: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
    },
    requiredRoles: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Required semantic roles used by validation. Use roles, not part kinds: for bicycles use bicycle_tire, bicycle_frame, bicycle_fork, handlebar, saddle, chain_loop; for cars use vehicle_body, vehicle_tire, vehicle_window, headlight, front_bumper, rear_bumper.',
    },
    semanticRoles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Compatibility alias for requiredRoles. Prefer requiredRoles in new calls.',
    },
    validationTargets: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Concrete geometry checks to satisfy, e.g. exactly 4 tires, windows above body, red body material.',
    },
    assumptions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only meaningful inferred choices, not generic filler.',
    },
  },
}

export const COMPOSE_PRIMITIVE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'compose_primitive',
    description:
      'Create editable primitive shapes in the 3D scene. Choose the primitive that matches each surface type: boxes/panels, cylinders/tubes, cones/frustums, hemispheres, torus rings, wedges/trapezoids, capsules, half-cylinders, lathes, extrusions, swept tubes, repeated arrays, or beveled extrusions with holes. Use attachTo/anchor/childAnchor for connected parts instead of hand-computing offsets.',
    parameters: {
      type: 'object',
      properties: {
        geometryBrief: GEOMETRY_BRIEF_SCHEMA,
        shapes: {
          type: 'array',
          description:
            'Shapes to create, ordered from parent to child. Child shapes use attachTo plus explicit anchor/childAnchor to reference and snap to an earlier shape index.',
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: [
                  'box',
                  'cylinder',
                  'hollow-cylinder',
                  'cone',
                  'frustum',
                  'hemisphere',
                  'torus',
                  'wedge',
                  'trapezoid-prism',
                  'sphere',
                  'lathe',
                  'capsule',
                  'half-cylinder',
                  'rounded-panel',
                  'ellipsoid',
                  'ellipse-panel',
                  'semi-ellipse-panel',
                  'pyramid',
                  'extrude',
                  'sweep',
                ],
                description:
                  'Primitive type. box=solid cuboid, rounded-panel=thin bevelled rounded rectangle, cylinder=solid circular extrusion, hollow-cylinder=tube/pipe, cone=pointed circular cone, frustum=truncated cone/circular taper, hemisphere=closed dome, torus=ring/donut tube, wedge=sloped triangular prism, trapezoid-prism=tapered rectangular prism, capsule=rounded-ended bar, half-cylinder=semicircular extrusion, sphere/ellipsoid=scaled round body, ellipse-panel/semi-ellipse-panel=thin oval profiles, pyramid=square pyramid, lathe=revolved vertical profile, extrude=custom 2D profile with depth, sweep=tube along a 3D path.',
              },
              position: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description:
                  'World-space geometric center [x, y, z] in meters. Always use the absolute world position, even for attached shapes; the system auto-aligns via anchor/childAnchor.',
              },
              rotation: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description:
                  'Local Euler rotation [x, y, z] in radians. Defaults to [0, 0, 0]. For cylinders, prefer axis for primary orientation.',
              },
              scale: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description:
                  'Non-uniform scale [sx, sy, sz] for spheres/hemispheres to create ellipsoids or flattened domes. [2, 0.3, 1] makes a wide flat dome. [1, 2, 1] makes an elongated egg/dome. Defaults to [1, 1, 1].',
              },
              length: { type: 'number', description: 'Box length along local X, in meters.' },
              width: { type: 'number', description: 'Box width/depth along local Z, in meters. If thinking in natural width/depth/height terms, use length for the left-right width and width for the front-back depth.' },
              height: { type: 'number', description: 'Box/wedge/trapezoid height along Y, or cylinder/hollow-cylinder/cone/frustum/capsule/half-cylinder length along its axis, in meters. Do not omit this for table legs, cones, handles, or tapered parts.' },
              depth: {
                type: 'number',
                description: 'Extrude depth along local Z, in meters. Also accepted as object depth for templates.',
              },
              thickness: {
                type: 'number',
                description: 'Rounded-panel thickness along local Y, in meters.',
              },
              radius: { type: 'number', description: 'Cylinder/cone/sphere/hemisphere/capsule/torus fallback radius, in meters.' },
              radiusTop: { type: 'number', description: 'Frustum top radius, in meters.' },
              radiusBottom: { type: 'number', description: 'Frustum bottom radius, in meters.' },
              majorRadius: { type: 'number', description: 'Torus centerline radius, in meters.' },
              tubeRadius: { type: 'number', description: 'Torus tube radius, in meters.' },
              topScale: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description: 'Trapezoid-prism top face scale [xScale, zScale] relative to bottom face. [0.6,0.8] tapers inward; [1.2,1.0] flares along X.',
              },
              topLengthScale: { type: 'number', description: 'Trapezoid-prism top X scale relative to bottom length.' },
              topWidthScale: { type: 'number', description: 'Trapezoid-prism top Z scale relative to bottom depth.' },
              slopeAxis: { type: 'string', enum: ['x', 'z'], description: 'Wedge slope direction axis. Use z for ramps/car hoods front-back, x for side wedges.' },
              slopeDirection: { type: 'string', enum: ['positive', 'negative'], description: 'Wedge high side direction along slopeAxis. positive means +X or +Z high side.' },
              axis: {
                type: 'string',
                enum: ['x', 'y', 'z'],
                description:
                  'Primary axis. For cylinder/hollow-cylinder/cone/frustum/capsule/half-cylinder/hemisphere it is the length/dome-up axis. For torus it is the ring normal/axle axis. "y"=vertical, "x"=left-right, "z"=front-back. Bicycle/vehicle wheel_set tires use axis="z" so the wheel disk is vertical in the X/Y plane.',
              },
              radialSegments: {
                type: 'number',
                description:
                  'Round-part smoothness for cylinders, cones, frustums, torus cross-sections, capsules, half-cylinders, and sweeps. Use 24-48 for visible mechanical parts.',
              },
              capSegments: {
                type: 'number',
                description: 'Capsule cap smoothness. Use 4-8 for low-poly soft rounded ends.',
              },
              tubularSegments: {
                type: 'number',
                description: 'Sweep/torus path smoothness. Use 16-40 for curved cables/handles and 48-96 for visible rings or tires.',
              },
              widthSegments: {
                type: 'number',
                description: 'Sphere horizontal smoothness. Use 24-48 for visible round joints.',
              },
              heightSegments: {
                type: 'number',
                description: 'Sphere vertical smoothness. Use 16-32 for visible round joints.',
              },
              wallThickness: {
                type: 'number',
                description: 'Wall thickness in meters for hollow cylinders (buckets, pipes, barrels, cans, cups, pots, vases, drums). Omit for solid cylinders like legs or columns.',
              },
              cornerRadius: {
                type: 'number',
                description:
                  'Box-only rounded corner radius in meters. Use 0.02-0.12 for manufactured plastic/metal housings, vehicle bodies, appliance shells, cabinets, and softened furniture. Use 0 for sharp construction blocks.',
              },
              cornerSegments: {
                type: 'number',
                description:
                  'Box-only rounded corner smoothness. Use 3-5 for normal low-poly rounded boxes, 6-8 for close-up smooth housings.',
              },
              profile: {
                type: 'array',
                items: { type: 'array', items: { type: 'number' } },
                description:
                  'For lathe and extrude shapes. Lathe: [radius,height] points revolved around Y, bottom-to-top. Extrude: closed outer [x,y] outline extruded through depth. For gears or logos, precompute every outline point as numeric literals.',
              },
              holes: {
                type: 'array',
                items: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                description:
                  'Extrude-only inner cutout loops. Each hole is a closed [x,y] polygon. Use holes for bores, slots, and keyways. Example: holes:[[[0.1,0],[0,0.1],[-0.1,0],[0,-0.1]]].',
              },
              path: {
                type: 'array',
                items: { type: 'array', items: { type: 'number' } },
                description:
                  'For sweep shapes only. Local 3D path as [[x,y,z],...]; node position is the center. Use for cables, hoses, rails, handles, bumper arcs.',
              },
              segments: {
                type: 'number',
                description: 'For lathe shapes only. Number of rotational segments (smoothness). Use 32-64 for visible curved surfaces. Default: 32.',
              },
              arc: {
                type: 'number',
                description: 'For lathe shapes only. Revolve angle in radians. Use 2*PI (~6.283) for full revolution. Use smaller values for partial sweeps. Default: 6.283 (full circle).',
              },
              bevelSize: {
                type: 'number',
                description: 'Extrude bevel size in meters. Use 0.005-0.03 for softened real-world profiles.',
              },
              bevelThickness: {
                type: 'number',
                description: 'Extrude bevel thickness in meters.',
              },
              bevelSegments: {
                type: 'number',
                description: 'Extrude bevel smoothness. Use 1-4 for low-poly bevels.',
              },
              curveSegments: {
                type: 'number',
                description: 'Extrude curve smoothness for curved profile edges.',
              },
              closed: {
                type: 'boolean',
                description: 'Sweep only. true closes the tube path into a loop.',
              },
              array: {
                type: 'object',
                description: 'Repeat this primitive before validation. Use for grilles, screw rows, louvers, fins, legs, ribs, and repeated appliance details. Linear: {count, step:[x,y,z]} or {count, axis, spacing}. Grid: {columns, rows, layers, spacing:[x,y,z]}.',
                properties: {
                  count: { type: 'number', description: 'Linear repeat count including the original shape.' },
                  columns: { type: 'number', description: 'Grid columns along local/world X step.' },
                  rows: { type: 'number', description: 'Grid rows along local/world Z step.' },
                  layers: { type: 'number', description: 'Grid layers along local/world Y step.' },
                  step: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Linear repeat offset [dx,dy,dz] in meters.' },
                  spacing: { description: 'Grid spacing [dx,dy,dz] or scalar linear spacing.' },
                  axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'Linear repeat axis when using scalar spacing.' },
                },
              },
              arrayCount: { type: 'number', description: 'Compatibility shortcut for array.count.' },
              arrayStep: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Compatibility shortcut for array.step.' },
              material: {
                type: 'object',
                description:
                  'Optional material. Prefer {properties:{color:"#C4956A", roughness:0.6, metalness:0, opacity:0.8, transparent:true}}. For gradients use {properties:{color:"#ef4444", opacity:0.8, transparent:true}, gradient:{type:"linear", space:"uv", axis:"y", stops:[{offset:0,color:"#ef4444",opacity:1},{offset:1,color:"#111827",opacity:1}]}}. Also accepted: {color:"#C4956A"} or {preset:"wood"}.',
              },
              materialPreset: { type: 'string', description: 'Optional material preset id.' },
              name: { type: 'string', description: 'Shape name.' },
              semanticRole: {
                type: 'string',
                description:
                  'Optional validation role for important shapes, e.g. vehicle_body, vehicle_tire, vehicle_window, headlight, front_bumper, rear_bumper, bicycle_tire, bicycle_frame.',
              },
              semanticGroup: {
                type: 'string',
                description:
                  'Optional logical group id shared by shapes that belong to the same semantic module.',
              },
              sourcePartKind: {
                type: 'string',
                description: 'Optional source part kind when hand-building a reusable module.',
              },
              sourcePartId: {
                type: 'string',
                description: 'Optional source part id/name when hand-building a reusable module.',
              },
              attachTo: {
                type: 'number',
                description:
                  '0-based parent shape index in the shapes array. Must reference a prior shape. Requires anchor and childAnchor. The child inherits parent rotation.',
              },
              anchor: {
                type: 'string',
                enum: ['top', 'bottom', 'center', 'front', 'back', 'left', 'right'],
                description:
                  'Parent connection point. Required when attachTo is used. Under a desktop uses anchor="bottom". On top of a base uses anchor="top".',
              },
              childAnchor: {
                type: 'string',
                enum: ['top', 'bottom', 'center', 'front', 'back', 'left', 'right'],
                description:
                  'Child connection point to align to the parent anchor. Required when attachTo is used. Use top when a drawer/cabinet hangs under a desktop bottom; use bottom for posts on top of a base; use back/front for face-mounted handles.',
              },
            },
            required: ['kind', 'position'],
          },
        },
      },
      required: ['shapes'],
    },
  },
}


export const COMPOSE_RECIPE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'compose_recipe',
    description:
      'Create an editable primitive object from a small closed-form deterministic recipe pack. Use only when the object is a professional standard part with stable geometry, such as gear.spur, sprocket.chain, pipe.flange/elbow90, fastener.hexBolt, bearing.pillowBlock, coupling.flexible, plate.perforated, valve.gate/ball, robotArm.threeAxis, motor.servo, or mixer.impeller. Do not use recipes for open-ended vehicles, outdoor AC units, machine tools, pumps, conveyors, fans, tanks, towers, reactors, compressors, grate coolers, or broad factory equipment; use compose_parts for dedicated industrial parts families and compose_assembly for broader open-ended families.',
    parameters: {
      type: 'object',
      properties: {
        recipeId: {
          type: 'string',
          enum: [
            'gear.spur',
            'sprocket.chain',
            'pipe.flange',
            'pipe.elbow90',
            'fastener.hexBolt',
            'bearing.pillowBlock',
            'coupling.flexible',
            'plate.perforated',
            'valve.gate',
            'valve.ball',
            'robotArm.threeAxis',
            'motor.servo',
            'mixer.impeller',
          ],
          description:
            'Built-in primitive recipe id. Use gear.spur for spur gears, sprocket.chain for roller-chain sprockets, pipe.flange for standard flanges, pipe.elbow90 for standard elbows, fastener.hexBolt for hex-head bolts, bearing.pillowBlock for mounted bearings, coupling.flexible for shaft couplings, plate.perforated for perforated/sieve plates, valve.ball/gate for standard valves, robotArm.threeAxis for 3-axis robot arms, motor.servo for servo motors, and mixer.impeller only for a simple shaft+hub+blade mixer part. Use compose_parts for pump, conveyor, electrical cabinet, and pipe-system family registries; use compose_assembly for broader open-ended vehicles, outdoor AC units, machine tools, fans, tanks, towers, reactors, compressors, grate coolers, and factory equipment.',
        },
        name: { type: 'string', description: 'Optional generated object name.' },
        geometryBrief: GEOMETRY_BRIEF_SCHEMA,
        params: {
          type: 'object',
          description:
            'Compact recipe parameters. Keep this small: intent/style/color/dimensions only. The recipe expands to stable compose_parts or compose_robot_arm geometry internally.',
          properties: {
            name: { type: 'string', description: 'Optional generated object name.' },
            color: { type: 'string', description: 'Primary CSS color alias, e.g. #cc0000 for red.' },
            primaryColor: { type: 'string', description: 'Primary CSS color.' },
            secondaryColor: { type: 'string', description: 'Secondary CSS color.' },
            accentColor: { type: 'string', description: 'Glass/accent CSS color.' },
            darkColor: { type: 'string', description: 'Rubber/shadow CSS color.' },
            metalColor: { type: 'string', description: 'Metal CSS color.' },
            size: {
              type: 'string',
              enum: ['tiny', 'small', 'medium', 'large'],
              description: 'Recipe size preset.',
            },
            sizeScale: { type: 'number', description: 'Overall recipe scale multiplier.' },
            length: { type: 'number', description: 'Optional length/reach in meters.' },
            width: { type: 'number', description: 'Optional width in meters.' },
            height: { type: 'number', description: 'Optional height in meters.' },
            detail: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Recipe detail level.' },
            highFidelity: {
              type: 'boolean',
              description: 'When true, request smoother/stylized high-fidelity primitive details inside the recipe.',
            },
            enhanceVisualDetails: { type: 'boolean', description: 'Alias for highFidelity.' },
            valveStyle: {
              type: 'string',
              enum: ['gate', 'ball'],
              description: 'Valve style hint; normally implied by recipeId.',
            },
            handleStyle: { type: 'string', enum: ['lever', 'handwheel'], description: 'Valve handle hint.' },
            axisCount: { type: 'number', description: 'Robot arm visible axis count; use 3 for robotArm.threeAxis.' },
            baseShape: {
              type: 'string',
              enum: ['round', 'square', 'pedestal'],
              description: 'Robot arm base shape. Use round for circular base.',
            },
            endEffector: {
              type: 'string',
              enum: ['gripper', 'suction', 'tool-flange'],
              description: 'Robot arm end effector. Default gripper.',
            },
            pose: {
              type: 'string',
              enum: ['rest', 'reach-forward', 'work-ready'],
              description: 'Robot arm pose. Default work-ready for a readable bent silhouette.',
            },
            reach: { type: 'number', description: 'Robot arm reach in meters.' },
            teeth: { type: 'number', description: 'gear.spur tooth count.' },
            module: { type: 'number', description: 'gear.spur module in millimeters, e.g. 4.5.' },
            outerDiameter: {
              type: 'number',
              description:
                'gear.spur/sprocket.chain outside/tip diameter, pipe.flange outside diameter, or coupling.flexible outside diameter in meters.',
            },
            nominalDiameter: {
              type: 'number',
              description:
                'pipe flange/elbow nominal diameter, fastener.hexBolt nominal shank diameter, bearing/coupling shaft diameter, or plate hole nominal diameter in meters.',
            },
            boltCircleDiameter: { type: 'number', description: 'pipe.flange bolt circle diameter in meters.' },
            boltCount: { type: 'number', description: 'pipe.flange bolt hole count.' },
            bendRadius: { type: 'number', description: 'pipe.elbow90 bend centerline radius in meters.' },
            angle: { type: 'number', description: 'pipe.elbow90 bend angle in degrees; default 90.' },
            jawCount: { type: 'number', description: 'coupling.flexible elastomer jaw/spider count.' },
            rows: { type: 'number', description: 'plate.perforated hole grid row count.' },
            columns: { type: 'number', description: 'plate.perforated hole grid column count.' },
            holeCount: { type: 'number', description: 'plate.perforated column/count hint when rows are omitted.' },
            holeDiameter: { type: 'number', description: 'plate.perforated circular hole diameter in meters.' },
            boltSpacing: { type: 'number', description: 'bearing.pillowBlock mounting hole spacing in meters.' },
            headHeight: { type: 'number', description: 'fastener.hexBolt head height in meters.' },
            headDiameter: { type: 'number', description: 'fastener.hexBolt across-corner head diameter in meters.' },
            shankLength: { type: 'number', description: 'fastener.hexBolt shank length in meters.' },
            threadLength: { type: 'number', description: 'fastener.hexBolt threaded length in meters.' },
            pitchDiameter: { type: 'number', description: 'gear.spur pitch diameter in meters.' },
            rootDiameter: { type: 'number', description: 'gear.spur root diameter in meters.' },
            thickness: { type: 'number', description: 'gear/sprocket/plate/flange axial thickness in meters.' },
            boreDiameter: { type: 'number', description: 'gear/sprocket/bearing/coupling bore diameter in meters.' },
            keywayWidth: { type: 'number', description: 'gear.spur keyway width in meters.' },
            keywayDepth: { type: 'number', description: 'gear.spur keyway radial depth in meters.' },
            bladeCount: { type: 'number', description: 'mixer.impeller blade count; default 3.' },
            bladeLength: { type: 'number', description: 'mixer.impeller blade radial length in meters.' },
            bladeWidth: { type: 'number', description: 'mixer.impeller blade width in meters.' },
            bladeThickness: { type: 'number', description: 'mixer.impeller blade thickness in meters.' },
            bladeTilt: { type: 'number', description: 'mixer.impeller blade tilt in degrees; default 0. Use compose_parts + propeller_blade_set for new mixer/agitator blade requests.' },
            shaftDiameter: { type: 'number', description: 'mixer.impeller vertical shaft diameter in meters.' },
            shaftLength: { type: 'number', description: 'mixer.impeller vertical shaft length in meters.' },
            position: {
              type: 'array',
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
              description: 'Optional object origin [x,y,z].',
            },
          },
        },
      },
      required: ['recipeId'],
    },
  },
}

export const COMPOSE_ASSEMBLY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'compose_assembly',
    description:
      'Create one editable object through the constraint-first automatic instruction-sheet generator. Prefer this only for supported open-ended families without a dedicated parts family: vehicles, outdoor AC units, machine tools (lathe/milling/grinder/planer/drill/CNC), industrial robot arms, fans, tanks, distillation/chemical towers or columns, reactors, compressors, grate coolers, and broad factory equipment. Use compose_parts family registries for pumps, belt conveyors, electrical/control cabinets, and pipe systems. Plain chimneys/smokestacks are not assembly towers; use compose_parts with chimney_stack. If the requested family is unsupported, do not retry assembly; switch to compose_parts and build from generic reusable parts. Pass hard constraints such as length, width/diameter, height, primaryColor. Use compose_recipe only for closed-form standard instruction sheets such as gears/sprockets, flanges/elbows, fasteners, bearings, couplings, perforated plates, standard valves, robotArm.threeAxis, mixer.impeller, and servo motors.',
    parameters: {
      type: 'object',
      additionalProperties: true,
      properties: {
        family: {
          type: 'string',
          enum: ['vehicle', 'fan', 'pump', 'conveyor', 'machine_tool', 'outdoor_ac', 'tank', 'distillation_tower', 'reactor', 'compressor', 'grate_cooler', 'electrical', 'robot_arm'],
        },
        object: { type: 'string' },
        style: { type: 'string' },
        length: { type: 'number' },
        width: { type: 'number' },
        diameter: { type: 'number', description: 'Cylindrical diameter in meters; for towers/columns this maps to width.' },
        height: { type: 'number' },
        primaryColor: { type: 'string' },
        color: { type: 'string' },
      },
    },
  },
}

export const COMPOSE_PARTS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'compose_parts',
    description:
      'Create one editable object from the reusable building-block library. Parts are generic kernels; assign semanticRole to give context-specific meaning. Use this for explicit reusable part blueprints, industrial family registries, subassemblies, and any object family not supported by compose_assembly. Recipes are instruction sheets that reference parts; assembly is the automatic instruction-sheet generator.',
    parameters: {
      type: 'object',
      properties: {
        geometryBrief: GEOMETRY_BRIEF_SCHEMA,
        name: { type: 'string', description: 'Object name, e.g. "standing fan".' },
        partName: {
          type: 'string',
          description: 'Compatibility alias for name. Prefer name in new tool calls.',
        },
        family: {
          type: 'string',
          enum: ['pump', 'conveyor', 'electrical', 'pipe_system', 'aircraft', 'kiosk', 'desk', 'generic'],
          description:
            'Optional parts-family registry id. Use pump, conveyor, electrical, or pipe_system for industrial equipment so top-level dimensions drive editable part parameters.',
        },
        length: { type: 'number', description: 'Overall object length in meters.' },
        width: { type: 'number', description: 'Overall object width/depth in meters.' },
        height: { type: 'number', description: 'Overall object height in meters.' },
        diameter: { type: 'number', description: 'Overall cylindrical diameter in meters, mainly for pipe systems.' },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Object origin [x, y, z]. Part positions are offsets from this origin. Defaults to [0,0,0].',
        },
        detail: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Procedural detail level. medium is usually enough; high adds smoother rings/spokes.',
        },
        primaryColor: { type: 'string', description: 'Primary CSS color.' },
        secondaryColor: { type: 'string', description: 'Secondary CSS color.' },
        metalColor: { type: 'string', description: 'Metal/wire CSS color.' },
        darkColor: { type: 'string', description: 'Dark plastic/rubber CSS color.' },
        accentColor: { type: 'string', description: 'Accent/blade CSS color.' },
        autoComplete: {
          type: 'boolean',
          description:
            'When true or omitted, compose_parts may add missing structural essentials for recognized factory equipment, e.g. pump skid/motor/ports/flange or conveyor frame/rollers/belt.',
        },
        enhanceVisualDetails: {
          type: 'boolean',
          description:
            'When true, compose_parts adds recommended non-essential visual details such as impellers, nameplates, warning labels, control knobs, drive motors, or seam rings. Defaults to automatic only when the object name/request asks for detail or realism.',
        },
        parts: {
          type: 'array',
              description:
                'Reusable parts to procedurally expand into primitives. Complete family objects and family components are different intents: car steering wheel, car wheel, aircraft wing, pump impeller, and fan blade are single-component requests, not parent assemblies. For industrial families, prefer family:"pump", family:"conveyor", family:"electrical", or family:"pipe_system" with top-level length/width/height or diameter plus optional parts[].params; the registry fills required parts and clamps unsafe values. For kiosks, booths, ticket booths, vendor stalls, newsstands, small pavilions, and small sheds, use family:"kiosk" with kiosk_body, kiosk_roof, kiosk_opening, kiosk_counter, kiosk_sign, and kiosk_awning. If no dedicated part kind exists for a component, use family:"generic" with generic_body/generic_base/generic_panel/generic_handle/generic_spout/generic_control_panel/generic_display/generic_foot_set/generic_opening/generic_detail_accent before raw compose_primitive. For a standing fan use circular_base + vertical_pole + support_bracket + motor_housing + radial_blades + protective_grill + optional control_knob. For shaft + hub + propeller/impeller/mud-mixer blades use cylinder-like support parts plus propeller_blade_set; do not create a new recipe. For chimneys/smokestacks use chimney_stack with height/radius and warningStripes:true for red-white bands. For desks with visible drawers use desk_top + leg_set + drawer_stack. For electrical/control cabinets use electrical_cabinet + cable_tray + nameplate/warning details. For pipe systems use pipe_run + pipe_elbow + flange_ring/valve_body. For a complete bicycle use wheel_set semanticRole:bicycle_tire count:2 + tube_frame semanticRole:bicycle_frame + fork semanticRole:bicycle_fork + handlebar + saddle + chain_loop; do not invent bicycle_crank/chainring/pedals part kinds. For a complete car use body_shell semanticRole:vehicle_body + wheel_set count:4 semanticRole:vehicle_tire + window_strip semanticRole:vehicle_window variant:vehicle_glasshouse + light_pair + bar_pair; legacy vehicle_* aliases remain accepted. For complete aircraft/airplanes/airliners, use family:"aircraft" with top-level length/primaryColor and optional aircraft_* parts with params; the registry fills fuselage, wings, engines, T-tail, windows, and landing gear. Do not hand-place generic airfoil_blade/streamlined_body/wheel_set parts for complete aircraft. For a water pump / centrifugal blower use skid_base + ribbed_motor_body or rounded_machine_body + volute_casing + inlet_port + outlet_port + flange_ring + optional impeller_blades + control_box. For conveyors use conveyor_frame + roller_array + belt_surface. For tanks use cylindrical_tank plus pipe/flange details. For valves use valve_body plus optional handwheel; set valveStyle/handleStyle for variants such as ball valves instead of inventing internal parts. For factory scenes use gearbox_body, filter_vessel, heat_exchanger, agitator_tank, pipe_rack, platform_ladder, helical_ladder, electrical_cabinet, cable_tray, pipe_run, and pipe_elbow.',
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: [
                  'circular_base',
                  'vertical_pole',
                  'motor_housing',
                  'radial_blades',
                  'protective_grill',
                  'pyramid',
                  'support_bracket',
                  'control_knob',
                  'vent_slats',
                  'vent_grill',
                  'skid_base',
                  'rounded_machine_body',
                  'volute_casing',
                  'impeller_blades',
                  'propeller_blade_set',
                  'pipe_port',
                  'inlet_port',
                  'outlet_port',
                  'flange_ring',
                  'bolt_pattern',
                  'control_box',
                  'ribbed_motor_body',
                  'conveyor_frame',
                  'roller_array',
                  'belt_surface',
                  'cylindrical_tank',
                  'chimney_stack',
                  'valve_body',
                  'handwheel',
                  'wheel',
                  'wheel_set',
                  'window_panel',
                  'window_strip',
                  'body_shell',
                  'tube_frame',
                  'fork',
                  'light_pair',
                  'bar_pair',
                  'bicycle_wheels',
                  'bicycle_frame',
                  'bicycle_fork',
                  'handlebar',
                  'saddle',
                  'chain_loop',
                  'vehicle_body',
                  'vehicle_wheels',
                  'vehicle_windows',
                  'headlights',
                  'bumper',
                  'gearbox_body',
                  'filter_vessel',
                  'heat_exchanger',
                  'agitator_tank',
                  'pipe_rack',
                  'platform_ladder',
                  'helical_ladder',
                  'desk_top',
                  'leg_set',
                  'drawer_stack',
                  'electrical_cabinet',
                  'pipe_run',
                  'pipe_elbow',
                  'cable_tray',
                  'nameplate',
                  'warning_label',
                  'seam_ring',
                  'airfoil_blade',
                  'ellipsoid_shell',
                  'curved_lens_panel',
                  'ergonomic_shell',
                  'streamlined_body',
                  'lofted_panel',
                  'mobile_platform_chassis',
                  'lidar_sensor',
                  'emergency_stop_button',
                  'status_light_strip',
                  'operator_panel',
                  'guard_fence',
                  'pallet_table',
                  'bearing_block',
                  'coupling_guard',
                  'motor_gearbox_unit',
                  'pipe_manifold',
                  'hopper_body',
                  'service_platform',
                ],
                description:
                  'Reusable procedural part. kiosk_body/kiosk_roof/kiosk_opening/kiosk_counter/kiosk_sign/kiosk_awning build small kiosks, ticket booths, vendor stalls, newsstands, small pavilions, and sheds. generic_body/generic_base/generic_panel/generic_handle/generic_spout/generic_control_panel/generic_display/generic_foot_set/generic_opening/generic_detail_accent cover unknown long-tail equipment, simple objects, and devices while preserving semantic part roles. mobile_platform_chassis/lidar_sensor/status_light_strip/emergency_stop_button build AGV/AMR mobile platforms. operator_panel/guard_fence/pallet_table/bearing_block/coupling_guard/motor_gearbox_unit/pipe_manifold/hopper_body/service_platform are reusable industrial equipment accessories for workcells, conveyors, process machines, and packaged equipment. aircraft_fuselage/aircraft_wing/aircraft_engine/aircraft_vertical_stabilizer/aircraft_horizontal_stabilizer/aircraft_landing_gear are family-registry parts for complete aircraft; use parts[].params to tune length, span, engine count/radius, window count, colors, and landing gear. chimney_stack creates a tall tapered industrial chimney with base, rim, lift seams, access door, and optional red-white warning bands. pyramid creates a four-sided pyramid from length/width/height; set truncated:true or topScale/topRadius to make a flat-top truncated pyramid/frustum. vent_grill creates framed grille/louver panels; bolt_pattern creates screws/fasteners; leg_set creates support feet; nameplate creates rating plates; pipe_port/inlet_port/outlet_port create nozzles. propeller_blade_set creates count-based radial propeller/impeller/mixer paddle sets, including taiji-half circular-cropped blades with longitudinal curve; airfoil_blade creates continuous swept/tapered aircraft/turbine-like blades for local blade details, not complete aircraft layout; curved_lens_panel creates tinted non-rectangular lenses/visors; ergonomic_shell creates smooth mouse/controller/appliance shells; streamlined_body creates aerodynamic fuselage/car/train/appliance bodies; lofted_panel creates section-to-section transition fairings/panels. protective_grill creates a shallow domed fan cage; radial_blades creates airfoil-like fan blades; desk_top/leg_set/drawer_stack build office desks; electrical_cabinet/cable_tray build power/control cabinets and tray routes; pipe_run/pipe_elbow build process piping; wheel/wheel_set/window_panel/window_strip/body_shell/tube_frame/fork/light_pair/bar_pair are generic building blocks whose meaning comes from semanticRole; bicycle_* and vehicle_* aliases remain accepted but new calls should prefer generic parts; volute_casing creates pump/blower scroll casing; impeller_blades creates pump/turbine vanes; pipe/inlet/outlet/flange/bolt parts create industrial connection details; ribbed_motor_body, conveyor_frame, roller_array, belt_surface, cylindrical_tank, valve_body, handwheel, gearbox_body, filter_vessel, heat_exchanger, agitator_tank, pipe_rack, platform_ladder, and helical_ladder cover common factory equipment.',
              },
              partType: {
                type: 'string',
                description:
                  'Compatibility alias for kind. Prefer kind in new tool calls; accepted to recover from analysis text that says partType.',
              },
              id: { type: 'string', description: 'Stable part id for connectTo references, e.g. "pump_outlet".' },
              name: { type: 'string', description: 'Optional part name.' },
              partName: {
                type: 'string',
                description: 'Compatibility alias for name. Prefer name in new tool calls.',
              },
              params: {
                type: 'object',
                description:
                  'LLM-safe adjustable part parameters. Prefer params for family parts instead of raw coordinates. Kiosk examples: kiosk_body {length,width,height,primaryColor}; kiosk_roof {length,width,height,variant:pitch|flat}; kiosk_opening {length,height}; kiosk_counter {length,width,thickness}; kiosk_sign {length,height,accentColor}. Generic examples: generic_body {length,width,height,primaryColor,cornerRadius}; generic_base {length,width,thickness}; generic_spout {length,radius}; generic_control_panel/generic_display/generic_opening {length,height,thickness}. Industrial accessory examples: bearing_block {length,width,height,radius}; coupling_guard {length,radius,thickness}; motor_gearbox_unit {length,height,radius}; pipe_manifold {length,radius,count}; hopper_body {length,width,height}; service_platform {length,width,height,overallHeight}. Vehicle examples: body_shell {length,width,height,primaryColor,vehicleStyle}; wheel_set {count:2|4|6,radius,width,hubColor}; window_strip {height,tint,opacity}. Aircraft examples: aircraft_fuselage {length,width,height,count,primaryColor,accentColor,noseRoundness}; aircraft_wing {length,width,thickness,bladeSweep}; aircraft_engine {count,radius,length,width}; aircraft_landing_gear {length,width,radius}. Values are normalized and clamped by the tool.',
              },
              style: {
                type: 'string',
                description:
                  'Optional style hint consumed by supported procedural parts. For vehicle_body use sedan, suv, sports, van, or truck when inferable. Prefer this over inventing tiny unsupported part kinds.',
              },
              vehicleStyle: {
                type: 'string',
                enum: ['sedan', 'suv', 'sports', 'van', 'truck'],
                description:
                  'vehicle_body style preset. Use sedan for normal cars, suv for SUVs/off-road vehicles, sports for sports/racing cars, van for vans/MPVs, and truck for pickup/trucks.',
              },
              variant: {
                type: 'string',
                description:
                  'Optional variant hint for supported procedural parts, e.g. ball/gate for valves or visual subtype hints for machinery.',
              },
              valveStyle: {
                type: 'string',
                description:
                  'valve_body style hint. Use "ball" for ball valves / quarter-turn valves; omit for the default gate-valve-like body.'
              },
              handleStyle: {
                type: 'string',
                description:
                  'handwheel style hint. Use "lever" for ball valves or quarter-turn handles; omit for a circular handwheel.',
              },
              state: {
                type: 'string',
                description:
                  'Optional operating state hint such as open/closed. Use only when the requested object describes a meaningful visible state.',
              },
              connectTo: {
                description:
                  'Optional part id, name, kind, or prior part index to connect this part to. Use with anchor/childAnchor so flanges can snap to pipe ends or ports can snap to housings.',
              },
              connectPoint: {
                type: 'string',
                description:
                  'Semantic connection point on the parent part when connectTo is used. Examples: pipe open/base, volute inlet/outlet, motor shaft, valve inlet/outlet, tank top/nozzle.',
              },
              childPoint: {
                type: 'string',
                description:
                  'Semantic connection point on this child part. Examples: flange back/front, pipe base/open. Prefer connectPoint/childPoint over manual position for mechanical attachments.',
              },
              centeredOn: {
                description:
                  'Optional part id, name, kind, or prior part index. Align this part center on the referenced part in X/Z while keeping its own natural height. Use before manual position for centered modules.',
              },
              alignAbove: {
                description:
                  'Optional part id, name, kind, or prior part index. Stack this part on top of the referenced part by matching parent top to child bottom and centering X/Z.',
              },
              alignBeside: {
                description:
                  'Optional part id, name, kind, or prior part index. Place this part beside the referenced part; set side left/right/front/back to choose direction.',
              },
              offsetFrom: {
                description:
                  'Optional part id, name, kind, or prior part index. Like alignBeside, but intended for controlled offsets from a parent boundary; set offsetDirection and offsetDistance.',
              },
              offsetDirection: {
                type: 'string',
                enum: ['left', 'right', 'front', 'back', 'top', 'bottom'],
                description:
                  'Direction used by offsetFrom. Use front/back/left/right for ports, manifolds, labels, and external modules.',
              },
              offsetDistance: {
                type: 'number',
                description:
                  'Extra clearance in meters beyond parent/child extents when offsetFrom is used.',
              },
              around: {
                description:
                  'Optional part id, name, kind, or prior part index. Place this part around the referenced part on a circular distribution. Use with aroundCount for evenly spaced repeated supports, small fixtures, or decorative modules.',
              },
              aroundCount: {
                type: 'number',
                description:
                  'When around is set, duplicate this part into this many evenly spaced copies. Example: around:"tank", aroundCount:4, aroundRadius:0.5 for four feet around a vessel.',
              },
              aroundIndex: {
                type: 'number',
                description:
                  'Optional zero-based index when manually defining one element in an around distribution. Usually omit when using aroundCount.',
              },
              aroundRadius: {
                type: 'number',
                description:
                  'Optional radius in meters for around placement. Omit to use parent/child extents plus relationGap.',
              },
              aroundAngle: {
                type: 'number',
                description:
                  'Optional absolute angle in radians for a single around-placed part. Prefer aroundCount for evenly spaced copies.',
              },
              aroundStartAngle: {
                type: 'number',
                description:
                  'Optional start angle in radians for aroundCount distributions. Use when the first item should start front/back/diagonal.',
              },
              aroundAxis: {
                type: 'string',
                enum: ['x', 'y', 'z'],
                description:
                  'Axis to distribute around. Default y means horizontal X/Z circle around a vertical object.',
              },
              cornerPattern: {
                type: 'boolean',
                description:
                  'When true with around, place repeated parts at rectangular parent corners instead of a circular distribution. Use for four feet/supports on a base.',
              },
              cornerInset: {
                type: 'number',
                description:
                  'Inset in meters from the parent corner when cornerPattern is true.',
              },
              array: {
                type: 'object',
                description:
                  'Linear repetition for one part after relationship placement. Use for evenly spaced cylinders, ribs, vents, bolts, and fins without hand-written positions.',
                properties: {
                  count: { type: 'number', description: 'Number of repeated copies.' },
                  axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'Repeat axis.' },
                  spacing: { type: 'number', description: 'Center-to-center spacing in meters.' },
                },
              },
              relationGap: {
                type: 'number',
                description:
                  'Optional clearance in meters used by alignAbove/alignBeside. Usually omit or use a small value such as 0.01-0.05.',
              },
              anchor: {
                type: 'string',
                enum: ['top', 'bottom', 'center', 'front', 'back', 'left', 'right'],
                description: 'Parent anchor when connectTo is used. Example: anchor="front" for the open end of a front-facing port.',
              },
              childAnchor: {
                type: 'string',
                enum: ['top', 'bottom', 'center', 'front', 'back', 'left', 'right'],
                description: 'Child anchor when connectTo is used. Example: childAnchor="back" to place a flange back face against a pipe front end.',
              },
              rotation: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description:
                  'Optional part-level Euler rotation [x,y,z] in radians. Use for angled motors, rotated pumps, diagonal conveyors, or rotated tanks.',
              },
              axis: {
                type: 'string',
                enum: ['x', 'y', 'z'],
                description:
                  'Part axis for ports, flanges, bolts, cylinders, and rings. x=left/right, y=vertical, z=front/back.',
              },
              side: {
                type: 'string',
                enum: ['left', 'right', 'top', 'bottom', 'front', 'back'],
                description:
                  'Semantic side for ports/flanges. This chooses the axis and places pipe rims on the open end, e.g. side="front" for a front suction inlet or side="top" for an upward discharge.',
              },
              outletAngle: {
                type: 'number',
                description:
                  'volute_casing discharge angle in radians in the XY plane. 0 points right, 1.57 points upward. Use to orient pump/blower outlet necks.',
              },
              position: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description:
                  'Part center/local reference offset [x,y,z] from object origin. Fan grille/blades/motor share the same Y height and face along Z.',
              },
              radius: { type: 'number', description: 'Generic radius for round parts.' },
              height: { type: 'number', description: 'Vertical height or part thickness depending on kind.' },
              width: { type: 'number', description: 'Part width, bracket width, or blade width depending on kind.' },
              depth: { type: 'number', description: 'Depth along Z, grille cage depth, or motor depth. For protective_grill this is the front-to-back cage thickness.' },
              domeDepth: { type: 'number', description: 'protective_grill front dome bulge along Z. Use 0.06-0.14 for a shallow half-round fan cage.' },
              length: { type: 'number', description: 'Length alias used by some parts. For vehicle_body this is the front-back body length along X.' },
              truncated: {
                type: 'boolean',
                description:
                  'For pyramid, true removes the pointed tip and creates a flat-top truncated pyramid/frustum.',
              },
              topScale: {
                type: 'number',
                description:
                  'For pyramid, top footprint scale relative to the base. Use 0.3-0.6 for a flat top instead of a sharp point.',
              },
              topRadius: {
                type: 'number',
                description:
                  'For pyramid, explicit top radius/half-width for a flat-top truncated pyramid. Usually prefer topScale.',
              },
              topLength: {
                type: 'number',
                description:
                  'For pyramid, desired top length in meters for a flat top. Usually prefer topScale.',
              },
              topWidth: {
                type: 'number',
                description:
                  'For pyramid, desired top width in meters for a flat top. Usually prefer topScale.',
              },
              sizeScale: {
                type: 'number',
                description:
                  'vehicle_body overall scale multiplier when exact dimensions are not specified. Use about 0.8 for a small car and 1.0 for a normal sedan.',
              },
              count: { type: 'number', description: 'Generic count, e.g. blade count.' },
              ringCount: { type: 'number', description: 'protective_grill curved concentric ring count. Use 4-5 for a fan guard.' },
              spokeCount: { type: 'number', description: 'protective_grill radial spoke count. Use 12-24 for a fan guard.' },
              wireRadius: { type: 'number', description: 'protective_grill wire thickness.' },
              warningStripes: {
                type: 'boolean',
                description:
                  'For chimney_stack, true adds red-white warning bands near the top like industrial smokestacks.',
              },
              stripeCount: {
                type: 'number',
                description: 'For chimney_stack, number of red-white warning bands. Use 4-7.',
              },
              stripeHeight: {
                type: 'number',
                description:
                  'For chimney_stack, vertical height in meters occupied by the warning band zone.',
              },
              wheelRadius: { type: 'number', description: 'vehicle_wheels/bicycle wheel radius alias.' },
              wheelWidth: { type: 'number', description: 'vehicle_wheels tire thickness along the axle.' },
              frontX: { type: 'number', description: 'vehicle_wheels optional front axle offset along the vehicle length axis.' },
              rearX: { type: 'number', description: 'vehicle_wheels optional rear axle offset along the vehicle length axis.' },
              frontZ: { type: 'number', description: 'Compatibility alias for frontX from older vehicle analysis; prefer frontX.' },
              rearZ: { type: 'number', description: 'Compatibility alias for rearX from older vehicle analysis; prefer rearX.' },
              overallHeight: { type: 'number', description: 'vehicle_body total car height in meters; height is also accepted.' },
              bodyHeight: { type: 'number', description: 'vehicle_body lower body shell height. Use a lower value for a sleeker sedan silhouette.' },
              cabinHeight: { type: 'number', description: 'vehicle_body cabin/roof block height. Use a compact value for a low roofline.' },
              roofCornerAngle: {
                type: 'number',
                description:
                  'vehicle_body cabin roof corner angle in degrees. Values below 90 create a tapered trapezoid-prism cabin; use about 85 when the user asks for roof corners that are not 90 degrees.',
              },
              cabinTopScale: {
                type: 'number',
                description:
                  'vehicle_body cabin top footprint scale. Values 0.85-0.95 make the roof slightly smaller than the cabin base for sloped, car-like roof pillars.',
              },
              cabinTopLengthScale: {
                type: 'number',
                description: 'vehicle_body optional X-only cabin top scale; prefer cabinTopScale unless the user asks for asymmetric proportions.',
              },
              cabinTopWidthScale: {
                type: 'number',
                description: 'vehicle_body optional Z-only cabin top scale; prefer cabinTopScale unless the user asks for asymmetric proportions.',
              },
              bladeRadius: { type: 'number', description: 'radial_blades/propeller_blade_set outer blade reach.' },
              bladeWidth: { type: 'number', description: 'radial_blades/propeller_blade_set/airfoil_blade max blade chord width. Use about 20-30% of bladeRadius or length.' },
              bladePitch: { type: 'number', description: 'radial_blades/propeller_blade_set/airfoil_blade blade pitch/twist hint in radians. Use 0.18-0.55 for visible real-fan, mixer, or propeller tilt.' },
              bladeSweep: { type: 'number', description: 'radial_blades/airfoil_blade tangential sweep/curvature amount. Positive values make the tips sweep back like real fan blades.' },
              bladeShape: {
                type: 'string',
                enum: ['taiji_half', 'airfoil'],
                description:
                  'propeller_blade_set shape. Use taiji_half for mud mixer/agitator/impeller paddles cut from a circular disk; use airfoil for aircraft/turbine propeller blades.',
              },
              verticalCurve: {
                type: 'number',
                description:
                  'propeller_blade_set longitudinal curve along the blade length in meters. Use 0.04-0.10 for mixer paddles so the blade bends along its radial spine, not just across its width.',
              },
              rootWidth: { type: 'number', description: 'airfoil_blade root chord width in meters; use wider roots for propeller/turbine/engine blades.' },
              tipWidth: { type: 'number', description: 'airfoil_blade tip chord width in meters; should be smaller than rootWidth for tapered blades.' },
              twist: { type: 'number', description: 'airfoil_blade twist hint in radians. Use 0.15-0.45 for propellers/engine fans.' },
              camber: { type: 'number', description: 'airfoil_blade/lens curvature amount in meters; gives a bent aerodynamic profile.' },
              pitch: { type: 'number', description: 'airfoil_blade pitch angle in radians. Use about 0.3-0.5 for visible propeller tilt.' },
              lensShape: {
                type: 'string',
                enum: ['frog', 'aviator', 'teardrop', 'rounded-rectangle'],
                description:
                  'curved_lens_panel outline style. Use frog for 铔よ焼澧ㄩ暅 / oversized sunglasses lenses, aviator/teardrop for drop-shaped lenses.',
              },
              curvature: {
                type: 'number',
                description:
                  'curved_lens_panel visible bend/curvature in radians. Use 0.06-0.16 for sunglasses, goggles, visors, or curved observation windows.',
              },
              noseSlope: { type: 'number', description: 'ergonomic_shell front/nose slope amount, 0-1. Use 0.35-0.55 for mouse-like shells.' },
              tailSlope: { type: 'number', description: 'ergonomic_shell rear/tail taper amount, 0-1.' },
              sideTaper: { type: 'number', description: 'ergonomic_shell side narrowing amount, 0-0.6. Use for mouse/controller streamlined sides.' },
              noseRoundness: { type: 'number', description: 'streamlined_body nose roundness, 0-1. Higher values create a softer aircraft/train/car nose.' },
              tailTaper: { type: 'number', description: 'streamlined_body tail taper amount, 0-0.9. Use for fuselages, sports bodies, train noses, and tapered appliance shells.' },
              roofArc: { type: 'number', description: 'streamlined_body roof/canopy arc hint, 0-0.8. Use for car rooflines, airplane canopies, and smooth upper highlights.' },
              sections: {
                type: 'array',
                description:
                  'lofted_panel section list for section-to-section transitions. Each section may include x, y, z, width, height. Use 3-5 sections for fairings, curved covers, ducts, and tapered panels.',
                items: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    z: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                    length: { type: 'number', description: 'Compatibility alias for section width.' },
                  },
                },
              },
              slatCount: { type: 'number', description: 'vent_slats count.' },
              boltCount: { type: 'number', description: 'flange_ring/bolt_pattern bolt count. Use 4-8 for pump flanges.' },
              includeBolts: {
                type: 'boolean',
                description:
                  'flange_ring only. Defaults to true. Set false when using a separate bolt_pattern or when a plain gasket flange is desired.',
              },
              material: {
                type: 'object',
                description:
                  'Optional part material, same shape as primitive material, including properties.opacity/transparent and optional gradient stops.',
              },
              materialPreset: { type: 'string', description: 'Optional material preset id.' },
              color: { type: 'string', description: 'Optional CSS color shortcut.' },
              primaryColor: {
                type: 'string',
                description:
                  'Part-level primary CSS color alias, useful for vehicle_body when the requested car color is specified on the body part.',
              },
              secondaryColor: { type: 'string', description: 'Part-level secondary CSS color alias.' },
              metalColor: { type: 'string', description: 'Part-level metal CSS color alias.' },
              darkColor: { type: 'string', description: 'Part-level rubber/shadow CSS color alias.' },
              accentColor: { type: 'string', description: 'Part-level accent/glass CSS color alias.' },
            },
          },
        },
      },
      required: ['parts'],
    },
  },
}


export const COMPOSE_ROBOT_ARM_TOOL = {
  type: 'function' as const,
  function: {
    name: 'compose_robot_arm',
    description:
      'Create an editable draft industrial robot arm from a stable primitive template. Prefer this over compose_primitive for robot arm, industrial arm, FANUC arm, cobot, manipulator, gripper arm, or 6-axis robot requests. It creates an approximate blockout with base, shoulder, upper arm, elbow, forearm, wrist, flange, and gripper.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional object name prefix.' },
        style: {
          type: 'string',
          enum: ['industrial', 'collaborative', 'fanuc'],
          description: 'Robot arm style. Use fanuc when the user asks for FANUC-like yellow industrial arms.',
        },
        pose: {
          type: 'string',
          enum: ['rest', 'reach-forward', 'work-ready'],
          description: 'Approximate generated pose.',
        },
        axisCount: {
          type: 'number',
          description:
            'Requested visible axis count, e.g. 3 for a simple 3-axis linkage. Defaults to a readable 3-axis draft.',
        },
        baseShape: {
          type: 'string',
          enum: ['round', 'square', 'pedestal'],
          description: 'Base shape hint. Use round when the user asks for a round/circular base.',
        },
        endEffector: {
          type: 'string',
          enum: ['gripper', 'suction', 'tool-flange'],
          description:
            'End effector style. Use gripper by default unless the user asks for a suction cup or bare tool flange.',
        },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Base position [x, y, z] in meters. Defaults to scene origin on the ground.',
        },
        reach: {
          type: 'number',
          description: 'Approximate total reach in meters. Defaults to 2.4.',
        },
        baseHeight: {
          type: 'number',
          description: 'Base cylinder height in meters. Usually omit unless requested.',
        },
        detail: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Round-part smoothness. Use medium by default.',
        },
        materialPreset: { type: 'string', description: 'Optional material preset id.' },
      },
      required: [],
    },
  },
}

const REVISION_SELECTOR_SCHEMA = {
  type: 'object',
  properties: {
    index: { type: 'number', description: 'Exact current shape index; prefer semantic selectors when possible.' },
    semanticRole: { type: 'string', description: 'Semantic role such as vehicle_cabin, vehicle_roof, vehicle_window, vehicle_body.' },
    semanticGroup: { type: 'string', description: 'Semantic group id shared by related shapes.' },
    sourcePartKind: { type: 'string', description: 'Source part kind such as vehicle_body, vehicle_windows, vehicle_wheels.' },
    sourcePartId: { type: 'string', description: 'Source part id/name.' },
    kind: { type: 'string', description: 'Primitive kind filter.' },
    nameIncludes: { type: 'string', description: 'Case-insensitive name substring, e.g. "roof" or "side window".' },
  },
}

const REVISION_SHAPE_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [
        'box',
        'cylinder',
        'hollow-cylinder',
        'cone',
        'frustum',
        'hemisphere',
        'torus',
        'wedge',
        'trapezoid-prism',
        'sphere',
        'lathe',
        'capsule',
        'half-cylinder',
        'rounded-panel',
        'ellipsoid',
        'ellipse-panel',
        'semi-ellipse-panel',
        'pyramid',
        'extrude',
        'sweep',
      ],
    },
    name: { type: 'string' },
    semanticRole: { type: 'string' },
    semanticGroup: { type: 'string' },
    sourcePartKind: { type: 'string' },
    sourcePartId: { type: 'string' },
    editableHints: {
      type: 'object',
      description:
        'Optional semantic edit contract for later revisions, e.g. {primaryDimension:"length", canScale:["length","width","height"]}.',
    },
    position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
    rotation: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
    scale: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
    length: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
    depth: { type: 'number' },
    thickness: { type: 'number' },
    radius: { type: 'number' },
    radiusTop: { type: 'number' },
    radiusBottom: { type: 'number' },
    majorRadius: { type: 'number' },
    tubeRadius: { type: 'number' },
    topLengthScale: { type: 'number' },
    topWidthScale: { type: 'number' },
    slopeAxis: { type: 'string', enum: ['x', 'z'] },
    slopeDirection: { type: 'string', enum: ['positive', 'negative'] },
    axis: { type: 'string', enum: ['x', 'y', 'z'] },
    cornerRadius: { type: 'number' },
    cornerSegments: { type: 'number' },
    radialSegments: { type: 'number' },
    tubularSegments: { type: 'number' },
    widthSegments: { type: 'number' },
    heightSegments: { type: 'number' },
    profile: {
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
      description: 'Extrude/lathe profile points.',
    },
    holes: {
      type: 'array',
      items: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
      description: 'Extrude inner cutout loops.',
    },
    path: {
      type: 'array',
      items: { type: 'array', items: { type: 'number' } },
      description: 'Sweep path points.',
    },
    material: {
      type: 'object',
      description:
        'Optional material, e.g. {properties:{color:"#1e3a8a", opacity:0.75, transparent:true}}. For gradients use {properties:{color:"#ef4444", opacity:0.8, transparent:true}, gradient:{type:"linear", space:"uv", axis:"y", stops:[{offset:0,color:"#ef4444",opacity:1},{offset:1,color:"#111827",opacity:1}]}}.',
    },
    materialPreset: { type: 'string' },
  },
  required: ['kind', 'position'],
}

export const REVISE_GEOMETRY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'revise_geometry',
    description:
      'Patch the previous generated geometry artifact in response to user feedback. Prefer this for follow-up revision requests such as "roof looks wrong", "windows are detached", "make it smoother", "adjust proportions", or "keep the body but change the cabin". It preserves existing shapes unless operations remove/replace them. For simple color/material changes, use setMaterial with selectors by semanticRole; do not use replace or materialFrom.',
    parameters: {
      type: 'object',
      properties: {
        targetArtifactId: {
          type: 'string',
          description: 'The previous artifact id from the revision context. Omit only if there is exactly one current artifact.',
        },
        feedback: { type: 'string', description: 'User feedback being addressed.' },
        intent: {
          type: 'string',
          description:
            'Short internal plan, e.g. "replace separated cabin panels with integrated glasshouse and body-color pillars".',
        },
        userVisiblePlan: {
          type: 'string',
          description:
            'One concise Chinese sentence explaining what will be preserved and what will be changed.',
        },
        preserve: {
          type: 'array',
          items: { type: 'string' },
          description: 'Traits to preserve, e.g. body color, four wheels, overall scale, headlights.',
        },
        operations: {
          type: 'array',
          description:
            'Local edit operations. Use selectors by semanticRole/semanticGroup/sourcePartKind/nameIncludes. For color-only edits use setMaterial with color, e.g. belt_surface yellow and conveyor_frame/support_leg/drive_motor white. For "make blades/ports/feet longer/larger" prefer scaleSemantic with dimension:"primary" or "length" and factor such as 1.25.',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
                  'add',
                  'remove',
                  'replace',
                  'transform',
                  'resize',
                  'scaleSemantic',
                  'materialFrom',
                  'setMaterial',
                  'align',
                ],
              },
              selector: REVISION_SELECTOR_SCHEMA,
              from: REVISION_SELECTOR_SCHEMA,
              to: REVISION_SELECTOR_SCHEMA,
              edge: {
                type: 'string',
                enum: ['top', 'bottom', 'front', 'back', 'left', 'right', 'center'],
              },
              toEdge: {
                type: 'string',
                enum: ['top', 'bottom', 'front', 'back', 'left', 'right', 'center'],
              },
              offset: { type: 'number' },
              position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
              delta: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
              rotation: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
              scale: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
              factor: {
                type: 'number',
                description: 'scaleSemantic multiplier, e.g. 1.25 to enlarge selected semantic parts by 25%.',
              },
              dimension: {
                type: 'string',
                enum: [
                  'primary',
                  'uniform',
                  'length',
                  'width',
                  'height',
                  'depth',
                  'thickness',
                  'radius',
                  'diameter',
                  'majorRadius',
                  'tubeRadius',
                  'axisLength',
                  'profileX',
                  'profileY',
                ],
              },
              length: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              depth: { type: 'number' },
              thickness: { type: 'number' },
              radius: { type: 'number' },
              radiusTop: { type: 'number' },
              radiusBottom: { type: 'number' },
              majorRadius: { type: 'number' },
              tubeRadius: { type: 'number' },
              color: {
                type: 'string',
                description: 'Direct material color for setMaterial, e.g. "#FFFFFF" or "#f5c842".',
              },
              materialPreset: { type: 'string' },
              material: {
                type: 'object',
                description:
                  'Full PrimitiveMaterialInput for setMaterial. Prefer color for simple recoloring. For gradients use material.gradient with 2-8 stops and material.properties.opacity for whole-material transparency.',
              },
              shapes: { type: 'array', items: REVISION_SHAPE_SCHEMA },
            },
            required: ['op'],
          },
        },
      },
      required: ['feedback', 'intent', 'operations'],
    },
  },
}

export type ComposeTool = typeof COMPOSE_RECIPE_TOOL | typeof COMPOSE_ASSEMBLY_TOOL | typeof COMPOSE_PARTS_TOOL | typeof COMPOSE_ROBOT_ARM_TOOL | typeof COMPOSE_PRIMITIVE_TOOL | typeof REVISE_GEOMETRY_TOOL
