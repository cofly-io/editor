# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assembly-part-selection.spec.ts >> assembly rotary kiln parts can be selected by double-click and edit-parts mode
- Location: e2e\assembly-part-selection.spec.ts:305:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 30000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]: 当前场景会自动保存。
      - link "打开最近场景" [ref=e5] [cursor=pointer]:
        - /url: /scenes
      - generic [ref=e6]: ·
      - button "新建" [ref=e7] [cursor=pointer]
    - generic [ref=e9]:
      - generic [ref=e11]:
        - generic [ref=e12]:
          - button "AI助手" [ref=e13] [cursor=pointer]
          - button "场景" [ref=e14] [cursor=pointer]
          - button "物品" [ref=e15] [cursor=pointer]
          - button "UNS" [ref=e16] [cursor=pointer]
          - button "设置" [ref=e17] [cursor=pointer]
        - generic [ref=e19]:
          - generic [ref=e20]:
            - button "历史" [ref=e21] [cursor=pointer]: 历史
            - button "新建会话" [ref=e22] [cursor=pointer]
          - generic [ref=e25]:
            - generic [ref=e26]:
              - heading "开始新的 AI 会话" [level=3] [ref=e27]
              - paragraph [ref=e28]: 选择任务类型，AI 会使用匹配的工作流继续处理。
            - button "创建与修改工厂 创建厂房、车间、房间、区域布局，并持续修改当前画布内容。" [ref=e29] [cursor=pointer]:
              - generic [ref=e30]:
                - img [ref=e32]
                - generic [ref=e34]:
                  - generic [ref=e35]: 创建与修改工厂
                  - generic [ref=e36]: 创建厂房、车间、房间、区域布局，并持续修改当前画布内容。
            - button "创建设备与品件 生成单个设备、机器、部件或图生模型，可放到画布或保存为品件。" [ref=e37] [cursor=pointer]:
              - generic [ref=e38]:
                - img [ref=e40]
                - generic [ref=e43]:
                  - generic [ref=e44]: 创建设备与品件
                  - generic [ref=e45]: 生成单个设备、机器、部件或图生模型，可放到画布或保存为品件。
      - generic [ref=e48]:
        - generic:
          - generic [ref=e49]:
            - button "收起侧边栏" [ref=e51] [cursor=pointer]:
              - img [ref=e52]
            - generic [ref=e55]:
              - button "3D" [pressed] [ref=e56] [cursor=pointer]:
                - generic [ref=e57]: 3D
              - button "2D" [ref=e58] [cursor=pointer]:
                - generic [ref=e59]: 2D
              - button "分屏" [ref=e60] [cursor=pointer]:
                - img [ref=e61]
                - generic [ref=e63]: 分屏
          - generic [ref=e65]:
            - button "堆叠" [ref=e66] [cursor=pointer]:
              - generic [ref=e67]: 堆叠
            - button "全高" [ref=e68] [cursor=pointer]:
              - generic [ref=e69]: 全高
            - button "显示设置" [ref=e71] [cursor=pointer]:
              - img [ref=e72]
              - generic [ref=e73]: 显示
            - button [ref=e75] [cursor=pointer]:
              - img [ref=e76]
            - button "预览" [ref=e79] [cursor=pointer]:
              - img [ref=e80]
              - generic [ref=e83]: 预览
        - generic [ref=e86]:
          - generic:
            - region "Camera controls hint":
              - generic:
                - generic:
                  - generic: 平移
                  - generic:
                    - generic:
                      - generic:
                        - img "空格键":
                          - generic: 空格键
                      - generic:
                        - generic: +
                        - img "鼠标左键":
                          - generic: 鼠标左键
                - generic:
                  - generic: 旋转
                  - generic:
                    - generic:
                      - generic:
                        - img "鼠标右键":
                          - generic: 鼠标右键
                - generic:
                  - generic: 缩放
                  - generic:
                    - generic:
                      - generic:
                        - img "鼠标滚轮":
                          - generic: 鼠标滚轮
        - generic [ref=e91]:
          - generic [ref=e92]:
            - button "选择 V" [ref=e93] [cursor=pointer]:
              - img "选择" [ref=e95]
              - generic [ref=e97]: V
            - button [ref=e98] [cursor=pointer]
            - button "编辑场地" [ref=e100] [cursor=pointer]:
              - img "编辑场地" [ref=e102]
            - button "建造 B" [ref=e103] [cursor=pointer]:
              - img "建造" [ref=e105]
              - generic [ref=e107]: B
            - button "F" [ref=e108] [cursor=pointer]:
              - generic [ref=e112]: F
            - button [ref=e113] [cursor=pointer]
            - button "区域 Z" [ref=e116] [cursor=pointer]:
              - img "区域" [ref=e118]
              - generic [ref=e120]: Z
            - button "D" [ref=e121] [cursor=pointer]:
              - generic [ref=e122]:
                - img
              - generic [ref=e124]: D
          - 'button "Grid snap: 0.50" [ref=e126] [cursor=pointer]':
            - generic [ref=e127]: "0.50"
          - generic [ref=e129]:
            - button "References 0" [ref=e130] [cursor=pointer]:
              - generic [ref=e132]:
                - img "References" [ref=e133]
                - generic [ref=e134]: "0"
            - button "Reference settings" [ref=e135] [cursor=pointer]:
              - img [ref=e136]
          - generic [ref=e139]:
            - button "向左旋转" [ref=e140] [cursor=pointer]:
              - img "向左旋转" [ref=e142]
            - button "向右旋转" [ref=e143] [cursor=pointer]:
              - img "向右旋转" [ref=e145]
            - button "顶视图" [ref=e146] [cursor=pointer]:
              - img "顶视图" [ref=e148]
  - button "Open Next.js Dev Tools" [ref=e154] [cursor=pointer]:
    - img [ref=e155]
```

# Test source

```ts
  87  |       radius: 0.7,
  88  |       height: 6,
  89  |       radialSegments: 32,
  90  |       visible: true,
  91  |       materialPreset: 'metal',
  92  |       metadata: { semanticRole: 'kiln_shell' },
  93  |     } as SceneNode,
  94  |     [ids.inlet]: {
  95  |       object: 'node',
  96  |       id: ids.inlet,
  97  |       type: 'cylinder',
  98  |       name: 'Kiln inlet ring',
  99  |       parentId: ids.assembly,
  100 |       position: [-3.4, 2, 0],
  101 |       rotation: [0, 0, Math.PI / 2],
  102 |       radius: 0.7,
  103 |       height: 0.4,
  104 |       radialSegments: 32,
  105 |       visible: true,
  106 |       materialPreset: 'metal',
  107 |       metadata: { semanticRole: 'kiln_inlet_ring' },
  108 |     } as SceneNode,
  109 |     [ids.outlet]: {
  110 |       object: 'node',
  111 |       id: ids.outlet,
  112 |       type: 'cylinder',
  113 |       name: 'Kiln outlet ring',
  114 |       parentId: ids.assembly,
  115 |       position: [3.4, 2, 0],
  116 |       rotation: [0, 0, Math.PI / 2],
  117 |       radius: 0.7,
  118 |       height: 0.4,
  119 |       radialSegments: 32,
  120 |       visible: true,
  121 |       materialPreset: 'metal',
  122 |       metadata: { semanticRole: 'kiln_outlet_ring' },
  123 |     } as SceneNode,
  124 |     [ids.pier]: {
  125 |       object: 'node',
  126 |       id: ids.pier,
  127 |       type: 'box',
  128 |       name: 'Support pier',
  129 |       parentId: ids.assembly,
  130 |       position: [0, 0.45, 0],
  131 |       rotation: [0, 0, 0],
  132 |       length: 4.2,
  133 |       width: 1.4,
  134 |       height: 0.9,
  135 |       visible: true,
  136 |       materialPreset: 'concrete',
  137 |       metadata: { semanticRole: 'support_pier' },
  138 |     } as SceneNode,
  139 |   }
  140 | 
  141 |   return {
  142 |     nodes,
  143 |     rootNodeIds: [ids.building],
  144 |   }
  145 | }
  146 | 
  147 | async function seedAiPanel(page: Page) {
  148 |   await page.addInitScript(
  149 |     ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
  150 |     {
  151 |       key: AI_CHAT_STORAGE_KEY,
  152 |       state: {
  153 |         conversationId: 'assembly-part-selection-e2e',
  154 |         messages: [],
  155 |         input: '',
  156 |         generationMode: 'primitive',
  157 |         conversationPurpose: 'factory',
  158 |         inputExpanded: false,
  159 |         updatedAt: new Date().toISOString(),
  160 |       },
  161 |     },
  162 |   )
  163 | }
  164 | 
  165 | async function expectFactoryBridge(page: Page) {
  166 |   await expect
  167 |     .poll(
  168 |       () =>
  169 |         page.evaluate(() => {
  170 |           const bridge = (
  171 |             window as Window & {
  172 |               __pascalFactoryE2e?: Partial<FactoryE2eBridge>
  173 |             }
  174 |           ).__pascalFactoryE2e
  175 |           return (
  176 |             typeof bridge?.cameraView === 'function' &&
  177 |             typeof bridge.clearSelection === 'function' &&
  178 |             typeof bridge.sceneNodes === 'function' &&
  179 |             typeof bridge.selectNode === 'function' &&
  180 |             typeof bridge.setSelectMode === 'function' &&
  181 |             typeof bridge.selectedIds === 'function' &&
  182 |             typeof bridge.viewerFlags === 'function'
  183 |           )
  184 |         }),
  185 |       { timeout: 30_000 },
  186 |     )
> 187 |     .toBe(true)
      |      ^ Error: expect(received).toBe(expected) // Object.is equality
  188 | }
  189 | 
  190 | async function selectedIds(page: Page) {
  191 |   await expectFactoryBridge(page)
  192 |   return page.evaluate(() => {
  193 |     const bridge = (
  194 |       window as Window & {
  195 |         __pascalFactoryE2e?: FactoryE2eBridge
  196 |       }
  197 |     ).__pascalFactoryE2e
  198 |     return bridge?.selectedIds() ?? []
  199 |   })
  200 | }
  201 | 
  202 | async function setIsometricView(page: Page) {
  203 |   await expectFactoryBridge(page)
  204 |   await page.evaluate(() => {
  205 |     const bridge = (
  206 |       window as Window & {
  207 |         __pascalFactoryE2e?: FactoryE2eBridge
  208 |       }
  209 |     ).__pascalFactoryE2e
  210 |     bridge?.cameraView('isometric')
  211 |   })
  212 | }
  213 | 
  214 | async function activateSelectTool(page: Page) {
  215 |   await expectFactoryBridge(page)
  216 |   await page.evaluate(() => {
  217 |     const bridge = (
  218 |       window as Window & {
  219 |         __pascalFactoryE2e?: FactoryE2eBridge
  220 |       }
  221 |     ).__pascalFactoryE2e
  222 |     bridge?.setSelectMode()
  223 |   })
  224 | }
  225 | 
  226 | async function waitViewerInputIdle(page: Page) {
  227 |   await expectFactoryBridge(page)
  228 |   await expect
  229 |     .poll(
  230 |       () =>
  231 |         page.evaluate(() => {
  232 |           const bridge = (
  233 |             window as Window & {
  234 |               __pascalFactoryE2e?: FactoryE2eBridge
  235 |             }
  236 |           ).__pascalFactoryE2e
  237 |           return bridge?.viewerFlags() ?? null
  238 |         }),
  239 |       { timeout: 15_000 },
  240 |     )
  241 |     .toEqual({ cameraDragging: false, inputDragging: false, spacePanning: false })
  242 | }
  243 | 
  244 | async function selectNode(page: Page, nodeId: string) {
  245 |   await expectFactoryBridge(page)
  246 |   await page.evaluate((id) => {
  247 |     const bridge = (
  248 |       window as Window & {
  249 |         __pascalFactoryE2e?: FactoryE2eBridge
  250 |       }
  251 |     ).__pascalFactoryE2e
  252 |     bridge?.selectNode(id)
  253 |   }, nodeId)
  254 |   await expect.poll(() => selectedIds(page), { timeout: 15_000 }).toEqual([nodeId])
  255 | }
  256 | 
  257 | async function clearSelection(page: Page) {
  258 |   await expectFactoryBridge(page)
  259 |   await page.evaluate(() => {
  260 |     const bridge = (
  261 |       window as Window & {
  262 |         __pascalFactoryE2e?: FactoryE2eBridge
  263 |       }
  264 |     ).__pascalFactoryE2e
  265 |     bridge?.clearSelection()
  266 |   })
  267 |   await expect.poll(() => selectedIds(page), { timeout: 15_000 }).toEqual([])
  268 | }
  269 | 
  270 | type ScreenPoint = { x: number; y: number }
  271 | 
  272 | function kilnShellCandidatePoints(page: Page): ScreenPoint[] {
  273 |   const viewport = page.viewportSize() ?? { width: 1280, height: 720 }
  274 |   return [
  275 |     { x: viewport.width * 0.64, y: viewport.height * 0.4 },
  276 |     { x: viewport.width * 0.64, y: viewport.height * 0.44 },
  277 |     { x: viewport.width * 0.68, y: viewport.height * 0.39 },
  278 |     { x: viewport.width * 0.6, y: viewport.height * 0.39 },
  279 |     { x: viewport.width * 0.7, y: viewport.height * 0.44 },
  280 |     { x: viewport.width * 0.58, y: viewport.height * 0.44 },
  281 |   ]
  282 | }
  283 | 
  284 | async function clickKilnShell(page: Page, mode: 'click' | 'double', point?: ScreenPoint) {
  285 |   await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
  286 |   const { x, y } = point ?? kilnShellCandidatePoints(page)[0]!
  287 |   if (mode === 'double') {
```