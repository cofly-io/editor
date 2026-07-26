# 受限生成器 DSL 与可编辑 Mesh 开发计划

## 1. 目标与结论

将当前 AI 几何生成从“LLM 输出宽松 primitive 参数 → 容错归一化 → primitive 节点”演进为：

```text
LLM → 受限、图灵完备的 Generator DSL → Typed Assembly IR → 受控执行
    → 可序列化 mesh 产物 → GeneratedAssembly / GeneratedMeshNode → Viewer
```

本计划保留既有 recipe/profile 路线：命中可信工业模板时继续使用确定性 recipe；复杂但仍需部件级编辑的对象走 Generator DSL；视觉外观优先且无法可靠参数化的对象才走 AI 3D 资产路线。

核心约束：**DSL 不得退化成仅含 `part()`、`grid()` 的声明式 schema。** 它必须支持函数、变量、循环、条件和复用；收窄的是可调用 API、I/O 与副作用，不是计算表达能力。DSL 的每次成功执行必须产生有限、可验证、可序列化的 Assembly IR。

## 2. 已验证的现状

### 2.1 当前失真发生在编译/归一化，不是 Stage 1 意图理解

- `run_mrvfp28x_e02848ae` 的 Stage 1 已表达笔记本底座、110° lid、60 键阵列和轨迹板；Stage 2 tool-call 也保留了这些语义。最终 artifact 却把 60 个 key 置于同一坐标，并将 lid 变为零旋转。运行证据位于 `apps/editor/.generated/ai-harness-runs/runs/run_mrvfp28x_e02848ae/events.jsonl`。
- primitive shape 归一化会在默认值中将无法识别的旋转降为 `[0, 0, 0]`：`packages/editor/src/lib/ai-geometry-tool-shapes.ts:39-206` 与 `packages/editor/src/lib/ai-geometry-tool-normalizers.ts:4-28`。
- `centeredOn` 被改写为 center-to-center 的关系，布局计算直接采用父节点中心，因此重复 key 会重叠：`packages/editor/src/lib/ai-geometry-tool-relations.ts:288-357`、`packages/editor/src/lib/ai-geometry-tool-relations.ts:370-394`。
- primitive 数组展开支持线性/rows/columns，但本次 `subArray` 不是已定义语义：`packages/core/src/lib/primitive-compose.ts:389-463`。
- Stage 3 目前优先检查已知品类和角色，不包含笔记本的 hinge、重复阵列唯一性或部件重叠规则：`apps/editor/lib/ai-harness-runs/primitive-stage3-quality.ts:1340-1401`。

### 2.2 现有 generator 边界可复用，但不是 LLM 代码沙箱

- component pack generator 已通过子进程动态 import 并执行 `generate()`：`apps/editor/lib/ai-harness-runs/asset-component-generator-runner.ts:155-190`。
- 该执行器把 generator part 再次降为 `box`、`cylinder`、`cone`：`apps/editor/lib/ai-harness-runs/asset-component-generator-runner.ts:196-271`。
- 因此该路径只适用于已安装的可信 pack；不能直接执行 LLM 临时生成的脚本。

### 2.3 当前节点体系没有通用的可持久化 mesh node

- `buildGeneratedGeometryNodes` 仅将 artifact shapes switch 为既有 primitive node：`packages/editor/src/lib/ai-generated-geometry-nodes.ts:316-654`。
- `ItemNode` 以外部资产 URL (`asset.src`) 为核心，不适合作为临时、可修订、按部件 diff 的生成 mesh：`packages/core/src/schema/nodes/item.ts:82-153`。

## 3. 架构决策

### 3.1 三层真相来源

不得把“IR 是真相来源”理解为丢弃生成源码。三层职责如下：

| 层 | 持久化内容 | 用途 |
| --- | --- | --- |
| 作者真相 | DSL source、参数、DSL API 版本、source hash | 用户修改、LLM 修订与可重复生成 |
| 场景真相 | 已验证的 Assembly IR、生成 run metadata、IR hash | 场景保存、diff、override 迁移与审计 |
| 渲染产物 | Mesh blob/描述、材质、bounds、缩略图缓存 | Viewer 渲染、导出与性能优化 |

mesh 永远不是编辑真相；它可以重新生成或缓存失效。场景 IR 必须可在不加载 Three.js 的环境中解析和校验。

### 3.2 `partId` 是稳定身份，不是数组下标

Generator DSL 必须要求每个 part 产生确定性 ID。例如键盘使用 `keyboard.key.r${row}.c${col}`，不得使用随机数、时间戳、mesh hash 或未命名数组序号。

IR 验证分两类：

1. **同 source hash + 同 params 的重跑**：`partId` 集合、顺序和每个 ID 的 geometry fingerprint 必须确定；不确定性为硬错误。
2. **源码或参数变更后的重跑**：生成 `kept / added / removed` diff。若 removed ID 带有人工 override、外部引用或持久选择锚点，则生成 orphan 记录与用户可见警告，不得静默丢弃。

只有同一 `partId` 的 override 才自动重新叠加；禁止以 mesh 相似度猜测迁移人工修改。

### 3.3 执行安全边界

LLM DSL 的执行能力必须满足：

- 无模块 import、无文件系统、无网络、无 process/env、无动态 eval；
- 仅暴露 versioned geometry/assembly API；
- 设置 wall-clock timeout、CPU/内存、最大输出字节、最大 part 数、最大顶点/索引数和最大递归深度；
- 执行器处于独立、一次性的受限 worker process/容器；运行失败可以强杀；
- 浏览器 Web Worker 只用于预览或非可信性要求较低的客户端计算，不作为服务器不可信代码的唯一隔离边界；
- 不将完整 host stack 或宿主路径回传模型，只回传脱敏、结构化的编译/执行诊断。

### 3.4 LLM Prompt 契约是 DSL 产品的一部分

DSL 不能只靠 parser 与 sandbox 成立；模型必须获得稳定、版本化且可测试的“如何写 DSL”契约。阶段 3 的交付物除 compiler 外，必须同时包含以下 prompt contract：

| 契约项 | 约定 |
| --- | --- |
| API 注入 | 提供简明的通用 API 核心集（`part`、transform、material、约束、参数声明）以及按 `generationMode/category` 检索的几何 API 卡片；不得把全部长篇 API 文档无差别塞入每次上下文。每张卡片带 API version、签名、输入/输出、资源代价和一个最小合法示例。 |
| few-shot 示例 | 维护为版本化的、可运行的 fixture 库，而非散落 prompt 文本。修复后的 laptop fixture 是第一个标准示例；随后按 hinge、grid、lathe/extrude、层级与 revision 分类。示例只从通过 IR、sandbox、质量门的 run 提升而来。 |
| 输出格式 | 模型返回 DSL source、`params`、期望 semantic roles 与简短设计说明；source 与参数分离，禁止把用户原话或解释混入可执行 source。 |
| 诊断回喂 | 对模型返回机器可读的 `code`、`path/span`、`expected`、`actual`、`hint`、`retryable`；另生成面向用户的本地化摘要。模型修复 prompt 只使用结构化诊断、相关 source 片段和预算摘要，不暴露宿主错误栈。 |
| 成功度量 | 记录 DSL 首次编译成功率、首次端到端质量门通过率、3 轮内修复成功率、各诊断 code 分布、平均 token/修复轮数；按 DSL API 版本、模型版本、类别和示例集版本分桶。 |

Prompt contract 与 DSL API 共享版本号；任何 API 或诊断语义改变都必须同步更新 API 卡片、fixture 示例和评测集。prompt 选择过程也记录到 run event，保证坏样本可以复现“模型看到了什么”。

### 3.5 修订语义定位与并发一致性

修订不允许让模型在数百行 generator 中盲猜。DSL 必须有显式 `params` 声明块：每个可调参数具有稳定 key、类型/范围/单位、`semanticRole`、用户可读标签和可选 `affects` partId/role 模式。例如 `keyboard.keycap.width`、`keyboard.columns`、`deck.length` 是三个不同的可寻址参数。LLM 先把用户修订语句解析为候选参数与置信度；歧义高时返回候选修改及影响范围，而非任意改 source。无法由参数表达的修订才进入最小 source patch，并保留 source diff。

生成提交采用带 revision 的 compare-and-swap：开始重跑时记录 `baseAssemblyRevision`；手工 override 以追加事件写入并带其观察到的 revision。sandbox 完成后只在 base revision 仍有效时原子提交 `IR + diff + overrides`；否则以最新 override 日志重放并重新计算 diff，发生不可重放冲突时保留两边、标记冲突供用户处理，绝不覆盖手工编辑。第一期 sandbox 默认“一次性进程/每 run”，隔离优先；若后续池化，必须采用无状态 worker、每任务 reset、租约与污染检测，且单独压测后才启用。

## 4. 范围与非目标

### 本期范围

- 修正当前 primitive 编译器的静默降级。
- 建立 Typed Assembly IR、稳定 part identity 和 revision diff 契约。
- 实现可运行循环/函数/变量的受限 Generator DSL，以及隔离执行服务。
- 引入 GeneratedAssembly/GeneratedMeshNode 的可序列化渲染数据通道。
- 将 generator revision、part override、失败重试和质量验证接入 AI harness。

### 非目标

- 将任意 npm/Three.js/Node 代码开放给 LLM。
- 在第一期实现完整 CAD B-rep、布尔内核、UV 展开或物理仿真。
- 把所有工业 recipe 迁移为 DSL。
- 依靠 AI 3D 模型替代可参数化的工程结构。

## 5. 实施阶段

### 阶段 0：冻结现有失败样本并建立回归基线

**目的**：将当前笔记本 run 变成不会回归的编译/空间验证样本。

**涉及文件**：

- `apps/editor/.generated/ai-harness-runs/runs/run_mrvfp28x_e02848ae/events.jsonl`
- `packages/editor/src/lib/ai-geometry-tool-executor.test.ts`
- `packages/core/src/lib/primitive-compose.test.ts`

**工作项**：

1. 从 run 的 Stage 2 tool-call 提取最小 laptop fixture，不依赖运行时生成目录。
2. 分别覆盖 110° rotation、未知组合 anchor、二维 60-key grid、relation offset、屏幕相对 lid 的位置。
3. 对每一类错误定义“成功支持”或“返回结构化诊断”两种允许结果；不允许静默生成错误 artifact。

**验收标准**：

- 测试能复现旧行为：60 个 key 的 unique world position 数为 1、lid rotation 为零。
- 修复后，未支持字段不会产生成功 artifact；诊断带字段路径、期望格式和替代语法。

### 阶段 1：修复 primitive 编译器的静默降级

**目的**：以最低风险提高现有路线质量，并为 DSL 引入统一诊断模型。

**涉及文件**：

- `packages/editor/src/lib/ai-geometry-tool-normalizers.ts`
- `packages/editor/src/lib/ai-geometry-tool-shapes.ts`
- `packages/editor/src/lib/ai-geometry-tool-relations.ts`
- `packages/editor/src/lib/ai-geometry-tool-validation.ts`
- `packages/editor/src/lib/ai-geometry-tool-executor.ts`
- `apps/editor/lib/ai-harness-runs/primitive-runner.ts`

**工作项**：

1. 将 rotation 统一为显式 tagged input；支持 `{ axis, degrees }` 或返回诊断，编译输入层转换为弧度 Vec3，进入 Assembly IR 时统一转换为 `Quat`，禁止回退零旋转。
2. 将 anchor 区分为 canonical primitive anchor、可转换别名、未知 anchor；未知组合如 `back_top` 只能显式映射到新语义或报错，禁止降为 top/bottom。
3. 对 `subArray`、未定义 relation offset、未知 relation 字段返回诊断；在本阶段只实现已有契约能正确表达的二维 `rows/columns/spacing`，不隐式猜测 `subArray`。
4. 使 `centeredOn` 与显式偏移的组合可验证：要么正确计算局部 offset，要么要求改用支持的关系表达。
5. 统一诊断格式并将其作为 tool result 回喂 LLM；出现诊断时不创建/不替换场景节点。
6. 新增通用空间校验：重复实例的最小唯一位置数、同 ID/同 role 的意外完全重叠、无效变换、附件轴与 rotation 的矛盾。

**验收标准**：

- `{ axis: 'x', degrees: 110 }` 产生约 `1.919862` rad 的 X rotation，或返回明确错误，绝不为 `[0,0,0]`。
- `subArray` 不再被静默忽略。
- 对 60-key fixture，成功 artifact 中至少有 60 个不同的预期 grid position；若无法编译则 artifact 为 `undefined` 并含诊断。
- 质量门不能仅因角色齐全而放行“全重叠重复件”或“零角度 lid”。

### 阶段 2：定义 Typed Assembly IR 与稳定 identity 契约

**目的**：在引入任意复杂 geometry 前，先固定场景、修订与 diff 的数据边界。

**候选文件**：

- 新增 `packages/core/src/lib/generated-assembly-ir.ts`
- 新增 `packages/core/src/lib/generated-assembly-validation.ts`
- 更新 `packages/core/src/index.ts`
- 更新 `packages/editor/src/lib/ai-generated-geometry-core.ts`
- 新增 `packages/editor/src/lib/generated-assembly-diff.ts`

**IR 最小模型**：

```ts
type AssemblyIR = {
  schemaVersion: 1
  generator: { sourceHash: string; apiVersion: string; paramsHash: string }
  parts: Array<{
    id: string
    semanticRole?: string
    parentId?: string
    transform: { space: 'world' | 'local'; position: Vec3; rotation: Quat; scale: Vec3 }
    geometry: GeometryRecipe | MeshBlobRef
    material: SerializableMaterial
    fingerprint: string
  }>
  constraints: Array<HingeConstraint | GridConstraint | AttachmentConstraint>
}
```

**工作项**：

1. 定义 geometry recipe、raw mesh reference、world/local transform、hinge、grid、attachment 和 material 的纯数据类型；Core 不导入 Three.js。
2. 为每个 part 定义 deterministic ID、唯一性、父子无环、引用存在、有限数值、transform 合法性和资源预算校验。
3. 定义 `AssemblyDiff` 和 `OverrideOrphan`：按 partId 计算 kept/added/removed，并导出可审计结果。
4. 将当前 `GeneratedGeometryArtifact` 逐步适配为 IR 的 legacy primitive adapter，避免一次性替换所有 recipe/profile 调用方。

**验收标准**：

- IR 可通过 JSON 序列化/反序列化往返且保持 hash 稳定。
- 同 IR 输入的重复校验得出相同 partId 集合与 fingerprint。
- 重跑 diff 能将 `keyboard.key.r3.c7` 的 override 保留；删除该 key 时生成 orphan，而非丢失 override。
- Core 对 IR 的 typecheck 不引入 `three`、Viewer 或 Editor 依赖。

### 阶段 3：实现图灵完备但受限的 Generator DSL

**目的**：让 LLM 能用循环、函数与变量构造复杂几何，同时使可用能力受控且可版本化。

**候选文件**：

- 新增 `packages/core/src/lib/generated-geometry-dsl-contract.ts`
- 新增 `apps/editor/lib/ai-harness-runs/generated-geometry-dsl-compiler.ts`
- 新增 `apps/editor/lib/ai-harness-runs/generated-geometry-dsl-diagnostics.ts`
- 更新 `packages/editor/src/lib/ai-chat-harness/primitive-system-prompts.ts` 或新增 generator prompt

**工作项**：

1. 选择可解析、可审查的 DSL 表达方式；第一期可采用受限 TypeScript-like syntax 或 AST，而非暴露通用 JS runtime。
2. 支持值、函数、`for` 循环、条件、数组/矩阵计算和命名局部变量；禁止 import、host object、network、filesystem、时间和随机数。
3. 提供白名单 API：primitive/lathe/extrude/sweep、transform、material、`part(id, ...)`、`hinge(...)`、`grid(...)`、mesh composition。API 返回 IR builder，不能直接变更场景。
4. 强制 `partId` 来源可追踪；循环生成 part 时 DSL 编译器要求 ID 模板含确定性循环维度或显式稳定 key。
5. 编译器输出 `AssemblyIR + diagnostics`，而不是直接输出 `THREE.BufferGeometry`。
6. 同步实现并版本化 Prompt contract：核心 API + 按类别检索的 API 卡片、可运行 few-shot fixture 库、结构化诊断回喂格式和 prompt/示例集版本记录；laptop fixture 作为首个标准 few-shot 示例。
7. 要求 DSL 在 source 外声明带语义、单位、范围、影响部件的 `params` 块；revision 先做“用户意图 → 参数 key”的受约束定位，仅在没有合适参数时生成最小 source patch。

**验收标准**：

- DSL 示例可用函数和双循环生成 `5 × 12` 键盘，partId 为 `keyboard.key.r{row}.c{col}`。
- DSL 不含随机/时间输入时，连续两次编译输出一致 IR hash。
- 调用 import、fetch、process、globalThis 或未注册 API 时在编译期拒绝。
- DSL API 版本不匹配时产生迁移诊断，不执行旧语义。
- API 卡片、laptop few-shot fixture 与 compiler 的契约测试使用同一版本；任一标准示例可独立编译，并在受限执行后通过 IR 与空间质量校验。
- 对“键帽再大一点”“键盘再大一点”“底座再长一点”分别定位到预声明的参数或明确报告歧义与影响部件，不能任意修改无关 source。

### 阶段 4：引入进程级隔离执行与资源治理

**目的**：将可信 component pack 执行与不可信 LLM DSL 执行彻底分离。

**涉及/候选文件**：

- 保留 `apps/editor/lib/ai-harness-runs/asset-component-generator-runner.ts` 仅用于可信 pack
- 新增 `apps/editor/lib/ai-harness-runs/generated-geometry-sandbox-runner.ts`
- 新增 `apps/editor/lib/ai-harness-runs/generated-geometry-sandbox-protocol.ts`
- 更新 `apps/editor/lib/ai-harness-runs/types.ts`

**工作项**：

1. 使用 JSON stdin/stdout 协议启动独立执行 worker；入口固定，LLM source 只作为数据输入。
2. 在 worker 中加载 DSL compiler 与有限 geometry API，不动态 import LLM 提供的文件路径。
3. 实施 timeout、内存、最大 stdout、最大 part、最大顶点、最大索引和最大 blob 大小限制；任何超限均可终止 worker。
4. 记录 source hash、API version、resource usage、diagnostics 与 sanitized execution error；不保存 host 环境信息。
5. 设计失败重试：最多 2–3 次；同 source hash + 同诊断重复时停止；场景在所有验证通过前保持不变。
6. 第一期开启 per-run 一次性 worker，完成或超限即销毁；协议带 requestId、baseAssemblyRevision、deadline 和资源预算。worker pool 是后续优化项，启用前必须证明任务间无状态泄漏并有 reset、租约和污染检测。

**验收标准**：

- 无限循环、超大 mesh、未授权 API 调用在预算内终止，宿主进程仍可继续处理下一个 run。
- LLM DSL 无法读取仓库文件、环境变量或网络。
- 运行错误以结构化、脱敏诊断回喂，未产生 scene patch。
- 可信 component pack 的现有执行与 LLM DSL runner 不共享动态 import 权限。
- 两个并发的“重跑 + 手工移动部件”场景不会丢失后写入 override：提交以 revision compare-and-swap 完成，冲突可见且可重放或显式标记。

### 阶段 5：GeneratedMeshNode、Viewer 渲染与场景持久化

**目的**：让任意生成 mesh 保持现有 assembly 的选择、删除、材质和覆盖层能力。

**候选文件**：

- 新增 `packages/core/src/schema/nodes/generated-mesh.ts`
- 更新 `packages/core/src/schema` 导出与节点 registry
- 新增 `packages/viewer/src/systems/generated-mesh/generated-mesh-system.tsx`
- 更新 `packages/editor/src/lib/ai-generated-geometry-nodes.ts`
- 新增 `packages/editor/src/lib/generated-geometry-placement.ts`

**工作项**：

1. 新增 `GeneratedAssemblyNode` root metadata：generator provenance、IR ref/hash、params、generation run、override summary。
2. 新增 `GeneratedMeshNode`：`partId`、mesh blob/descriptor ref、local transform、material、semantic role、bounds 与 geometry fingerprint；不内嵌 DSL source 或完整 IR。
3. Viewer 将经过验证的 serializable mesh 还原为 `BufferGeometry`，设置 attributes/index，处理 normals/UV 缺失，并按节点生命周期释放资源。
4. 将 buildGeneratedGeometryNodes 改为支持 legacy primitive adapter 与 IR mesh adapter；每个 part 独立可选中，Assembly root 管理层级。
5. 新增 override 层：transform/material/visibility 等人工修改按 partId 保存并在每次 IR diff 后重放；orphan 进入待处理列表。
6. 定义生成物资产化桥接：Assembly 可导出为 GLB 作为冻结、可分发资产；同时可将 `DSL source + params + API version + validated IR + 示例缩略图` 发布为 workspace component pack，供后续场景以可修订方式复用。GLB 与 component pack 均记录源 assembly/hash，但前者不承担可修订真相来源。
7. 缩略图在“IR、mesh、材质及可见 override 全部提交成功”后异步生成；缓存键为 `meshHash + materialHash + thumbnailRendererVersion`。任一键变化或节点删除即失效，生成失败不阻塞场景提交。

**验收标准**：

- 一个 DSL 生成的多 part laptop 能选择 Assembly、选择单个 lid 或 key group、删除单部件、修改部件材质。
- 保存并重新加载场景后，mesh、IR hash、generator metadata 和 part override 一致。
- Viewer 不从 Core 导入 Three 数据；Core 节点保持 JSON 可序列化。
- 重跑后保留同 partId 的 override，并向 UI/日志暴露 orphan override。
- 用户可从满意的 laptop 明确选择“导出 GLB”或“保存为可修订 component pack”；前者可在其他场景导入，后者保留生成器与参数的复利，不需要重新提示 LLM。

### 阶段 6：AI harness 分流、质量门与修订闭环

**目的**：让模型根据能力匹配选择 route，并让 DSL route 使用更强的结构/空间验证。

**涉及文件**：

- `apps/editor/lib/ai-harness-runs/primitive-runner.ts`
- `apps/editor/lib/ai-harness-runs/primitive-generation-service.ts`
- `apps/editor/lib/ai-harness-runs/primitive-stage3-gate.ts`
- `apps/editor/lib/ai-harness-runs/primitive-stage3-quality.ts`
- `apps/editor/lib/ai-harness-runs/types.ts`
- `packages/editor/src/lib/ai-chat-harness/primitive-system-prompts.ts`

**工作项**：

1. Stage 1 输出 `generationMode` 与理由：`recipe`、`generator_dsl`、`ai_3d`；category 只是信号之一。
2. 分流规则：已验证 profile/recipe 且参数在范围内优先 recipe；需要 hierarchy、hinge、grid、曲面或计算布局时选 DSL；外观/纹理优先且低编辑性要求时选 AI 3D。
3. 将结构化 DSL diagnostics、sandbox diagnostics 和 IR spatial checks 纳入 run events。
4. 为 DSL route 增加通用质量门：重复实例位置唯一、bounds 合理、hinge pivot/角度、关系无环、partId 连续性、关键 part 不重叠。
5. 仅在 compiler、sandbox、IR、mesh 和质量门均通过后生成 scene patches；失败后进行有限修订重试。
6. 增加 `generator_dsl` feature flag、按用户/工作区可配置灰度比例和 kill switch；灰度期保存 route 决策与质量指标。DSL 连续失败达到阈值时仅可**显式**建议或执行被记录的 legacy primitive 降级，向用户展示失败原因、已尝试次数和降级结果，禁止静默 fallback。
7. 为初版设置可调整但明确的默认预算与 SLO：单次 sandbox wall time ≤ 5 秒、端到端非 LLM 渲染/提交 P95 ≤ 2 秒、最多 256 parts、每 assembly 最多 500,000 vertices / 1,500,000 indices / 64 MiB serialized mesh；超过任一预算返回诊断。上线前先记录两周基线，首个灰度目标为 DSL 首次编译成功率 ≥ 70%、3 轮内修复成功率 ≥ 85%、通过空间质量门的已编译 run ≥ 90%，未达标不扩大灰度。

**验收标准**：

- “生成一个笔记本电脑”被路由到 `generator_dsl`，而非 primitive fallback 或 AI 3D。
- 已支持且参数合法的工业 profile 仍路由到 recipe。
- 失败 run 的 events 包含每一层诊断与 retry 次数；失败前后 scene node 数不变。
- 成功 laptop 的 lid 是围绕 hinge pivot 的非零角度变换，键盘网格无完全重叠，屏幕属于 lid hierarchy。
- 运行事件包含 Prompt/API/示例集版本、首轮与修复轮结果、参数定位结果、route/flag 决策、预算消耗与降级原因；仪表盘可按模型、类别和 API 版本计算成功率。
- feature flag 关闭或灰度回退时，recipe/profile 与已验证 legacy primitive 路线保持可用；用户能看见 DSL 没有被采用的原因。

## 6. 验证矩阵

| 层级 | 必测内容 |
| --- | --- |
| 单元测试 | rotation/anchor/grid 编译；DSL parser、determinism、partId、IR validation、diff/orphan、mesh descriptor validation；语义参数定位、机器诊断格式和 API/prompt 版本契约 |
| 集成测试 | AI harness 诊断回喂、sandbox timeout、可信 pack 与 LLM DSL 权限隔离、scene patch 原子性、revision compare-and-swap 与 override 重放 |
| Viewer 测试 | `GeneratedMeshNode` attribute/index 重建、资源释放、选择与材质 override、场景 reload、缩略图缓存命中/失效、GLB 与 component pack 导出 |
| E2E | 笔记本生成、5×12 键盘、110° lid、修改键帽尺寸、删减网格后 orphan override 提示；“键盘再大一点”歧义处理；重跑期间手动移动 part；显式降级提示 |
| 回归测试 | 既有 recipe/profile/primitive 生成与 stage3 gate 保持行为；现有 artifact 可经 legacy adapter 渲染 |
| 可观测性 | run events 记录 route、feature flag、Prompt/API/示例集/source/IR/mesh hashes、预算消耗、diagnostic kind、retry count、参数定位、part diff 与降级摘要；按模型/类别/API 版本统计首轮成功率、3 轮修复率和质量门通过率 |

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| DSL 逐步变成第二套宽松 schema | 将函数/循环/变量列为 DSL 合约；只允许 builder API 输出 IR；禁止把 DSL API 简化为 JSON tool arguments。 |
| 受限 JS 逃逸或资源耗尽 | 独立受限进程/容器、无 host capability、强制预算与 kill；不复用可信 pack 的 dynamic import runner。 |
| mesh 过大导致 WebGPU/内存问题 | 顶点、索引、attribute、blob 与 part 数预算；Viewer 懒加载/释放；超限在 sandbox/IR 阶段拒绝。 |
| partId 改名导致人工编辑丢失 | deterministic ID、IR diff、orphan override、用户可见迁移决策；禁止相似度猜测。 |
| LLM 不会可靠使用新 DSL | Prompt contract 与 API 同版本；按类别检索 API 卡片；只从已验证 run 提升 few-shot；诊断对模型机器可读、对用户单独本地化；指标未达标不扩大灰度。 |
| 修订语义歧义导致改错部件 | 集中、带单位与影响范围的 params 块；先做参数定位和影响分析；高歧义显式呈现候选，不擅自 patch source。 |
| 重跑与手工 override 竞态 | 追加 override 日志、base revision、compare-and-swap 提交与冲突可见化；不直接以异步结果覆盖当前场景。 |
| DSL 灰度质量低于旧路线 | feature flag、按工作区灰度、kill switch 和带原因的显式 legacy 降级；保留 fixture 评测集作为扩量门槛。 |
| 旧 primitive 与新 IR 双路径回归 | 保持 legacy primitive adapter，并为 recipe/profile 建立明确 route contract tests。 |
| 质量门再次只检查角色 | 将 transform、bounds、重复位置、约束和 hierarchy 加入通用质量门；保留品类专属规则作为增量。 |

## 8. 完成定义

以下条件全部满足后，该路线才可视为完成第一期交付：

1. 当前笔记本失败样本不再生成“60 个重叠 key + 平躺 lid”的成功 artifact。
2. 可用 DSL 的函数与双循环生成多部件 laptop，并产出确定性 Assembly IR。
3. LLM 代码不能访问 host 文件、环境、网络或任意模块，且超时/超限可安全终止。
4. GeneratedMeshNode 可保存、加载、选择、删改材质并在 Viewer 正确渲染。
5. 修改 DSL/参数后，对保持相同 partId 的人工 override 可恢复；删除 partId 时可见 orphan，而非静默丢失。
6. 工业 recipe/profile 原有路径和质量门通过回归测试。
7. 每次生成 run 可追溯 route、source hash、IR hash、mesh hash、诊断、资源预算与 retry 结果。
8. Prompt contract、API 卡片和 few-shot fixture 可独立版本化；仪表盘达到首轮/修复/质量门 SLO 后才扩大 DSL 灰度。
9. 满意的 assembly 能以 GLB 冻结复用，或以 component pack 保留 DSL 与参数复用；缩略图缓存按定义的 hash 正确失效。

## 9. 实施前的设计确认点

阶段 3 开工前必须**同时**确定 DSL 语法载体和 Prompt contract，二者不可拆分后置：

1. DSL 语法载体：受限 TypeScript-like 文本、专用表达式语言或受控 AST。无论选择哪一种，必须同时满足本计划的图灵完备、确定性、白名单 API、无 I/O、可编译为 IR 五项约束。
2. Prompt contract：API 注入/检索策略、API 卡片格式、few-shot fixture 提升规则、模型诊断 JSON 格式、用户诊断本地化规则、评测口径与版本关联方式。
3. `params` 契约：语义角色、单位/范围、影响部件表达式、修订歧义阈值，以及 source patch 何时被允许。
4. 灰度门槛：首轮成功率、3 轮修复率、质量门通过率、预算/SLO 的初始阈值与扩量规则。

以上确认不会改变本计划的分层架构，但会决定 DSL 的可用性、可修订性与上线风险。

---

# 附录 A：工业设备场景补强建议（评审批注，2026-07-26）

本附录是对主计划的评审补强，**不改变主计划的分层架构与阶段划分**，只指出在"通用几何 DSL"之上、要服务工业设备（炼油厂/水泥/化工等）场景时必须补强的点。核心判断：主计划在通用生成器 DSL 层面已完整，但**它目前是一份"通用几何 DSL"，尚未长成"工业设备 DSL"**。以下按优先级排列。

## A.1 【最高优先】IR 需把工业语义建成一等公民

**问题**：主计划的 IR（§3.1、阶段 2）只建模了几何（transform/geometry/material）与约束（hinge/grid/attachment），**没有建模工业设备的核心语义——ports（接口）、medium（介质）、flow direction、设备间连接关系**。

工业设备的价值一半在"塔有几个接管、什么介质、朝哪、接哪根管"。这些信息目前只存在于 `ProcessEquipmentContract` 与 recipe 层；一旦走 DSL 路线，IR 里完全没有，将导致 DSL 生成的设备与现有 `connection-router`、`portOverrides`、`routeObstacle` 体系脱节——recipe/profile 路线保留的 ports/布线能力，到 DSL 路线会丢失。

**建议**：
- IR 增加：
  ```ts
  ports: Array<{
    id: string
    partId: string            // 挂在哪个 part 上
    medium: string            // water/hydrogen/gas/material/...
    side: 'left'|'right'|'front'|'back'|'top'|'bottom'
    height: number
    offset?: number
    direction?: Vec3
  }>
  connections?: Array<{ fromPort: string; toPort: string; medium: string }>
  ```
- 质量门增加"DSL 声明的 port 是否落在所属 part 的合法包络/侧面上"与"port 是否与 contract 声明的端口集合一致"。
- 让 DSL 的 `part()` API 支持声明 port，使布线层能像消费 recipe/profile 一样消费 DSL 产物。

## A.2 修订闭环需增加"自然语言 → IR 直接 override"短路

**问题**：主计划的修订路径是"用户改 → 解析为 params → 重跑 DSL"。但大量部件级微调（"盖子改红色""平台下移 0.5m"）**不需要重跑生成器**，是对已生成 IR 的直接 override，走 partId override 层即可，不应触发整次 sandbox 重跑。

**建议**：明确将修订分三类并给出路由规则：
- **(a) 参数级修订**（影响整体结构/布局，如"键盘多一列"）→ 走 params 重跑。
- **(b) 部件级属性微调**（颜色/材质/单部件位移，如"盖子改红色"）→ 直接写 partId override，**不重跑**。
- **(c) 结构变更**（增删部件）→ 重跑 + IR diff。

这能省去大量 sandbox 调用，也更符合"部件级可编辑"的直觉。需要在 §3.5 修订语义与阶段 6 分流中补充 (b) 类路径。

## A.3 输入侧可增加可选的"vision → params 预填"

**问题**：主计划假设 DSL 的输入永远是纯文本 prompt，因此几何只有"类别先验"（蒸馏塔≈圆柱+平台），没有"具体物体证据"。

**建议**：在不改变 DSL 架构的前提下，于阶段 6 分流旁增加**可选的**多模态预填步骤——用户给设备照片/草图，多模态模型仅用于**填写 DSL 的 `params` 块**（塔径比、封头类型、平台标高、接管位置），结构正确性仍由 DSL 编译器与质量门保证。

注意边界：**图片只用于提取 params，绝不让模型直接写 DSL 代码或 mesh**（避免退化为不可编辑的神经网格，也避免把"看图写代码"的不确定性引入结构层）。这是对"类别先验 → 具体实物"的低成本增强，非本期必需，可作为后续增强项。

## A.4 质量门需分层：通用几何门 + 行业工程门

**问题**：阶段 6 的质量门（位置唯一、bounds 合理、hinge 角度、无环、不重叠）对消费电子足够，但对工业设备太弱——能放行"几何合法但工程荒谬"的结果（平台无支撑、接管悬空、爬梯悬空、设备间距违反安全规范）。

**建议**：质量门分两层：
- **通用几何门**（主计划已有）：位置唯一、无环、不重叠、变换合法。
- **行业工程门**（新增）：复用现有 `layout-realism` 的 spacing rules、port 连通性、支撑/着地校验。可按 `generationMode`/category 挂载，工业 category 强制启用。

## A.5 明确 DSL 的粒度与整厂编排、缓存、instancing 的关系

**问题**：主计划的预算是**单 assembly**（≤256 parts、≤50 万顶点），但目标是**整厂几十上百台设备**。未说明：DSL 是单设备一次 sandbox 还是整厂一次？相同 profile 的多台设备如何复用 IR/mesh？与现有 `instancing-planner` 的关系？

**建议**：明确"**DSL 以单设备为粒度生成；整厂编排（布局、布线、实例化）复用 recipe/profile 的 instancing/connection 层**"。对相同 `sourceHash + paramsHash` 的设备复用已验证 IR 与 mesh 缓存，避免每台相似设备都重跑 sandbox。把这条写进阶段 4 的资源治理与阶段 6 分流。

## A.6 若干工程补强点

- **DSL 调试器/可视化**：主计划只说了诊断回喂 LLM。建议补一个面向人的"IR 树 + 部件预览"开发面板，显著降低 few-shot fixture 库的维护与排错成本。
- **IR 在线迁移（migrator）**：主计划提了 API 版本不匹配报诊断，但未说旧 IR 如何在线迁移。场景里存着 v1 IR、DSL 升到 v2 后老场景如何打开？需要 IR migrator 与版本兼容策略，写进阶段 2 的 IR 契约。
- **与 synthesizer 兜底的归位**：AI harness 现有 `synthesized-parts` 兜底（`synthesizeGeometryParts` → `composePartPrimitives` → 部件节点树）应明确归入"确定性 recipe/profile 路线"（即 `generationMode: 'recipe'`），不是 DSL 的替代品，避免后续被误用为 DSL 的简化实现。
- **routeObstacle/ports 元数据贯通**：DSL 产物的 root metadata 应携带与 recipe/profile 一致的 `factoryRouteObstacle`、`factoryNodePorts`、`equipmentContract`，保证布线/避让对三条路线一视同仁。

## A.7 优先级小结

| 优先级 | 项 | 一句话 |
| --- | --- | --- |
| 🔴 P0 | A.1 IR 工业语义（ports/介质/连接） | 决定 DSL 能否真正服务炼油厂，而非只能生成孤立设备 |
| 🟡 P1 | A.4 工程合理性质量门、A.2 修订短路 | 防"工程荒谬"产物；省下大量无谓 sandbox 重跑 |
| 🟡 P2 | A.5 整厂粒度与缓存、A.3 vision→params | 规模可用性；外观保真的低成本增强 |
| 🟢 P3 | A.6 调试器、IR migrator、归位与元数据贯通 | 工程健壮性与可维护性 |

**落地建议**：A.1 应在**阶段 2（IR 契约）开工前**并入 IR schema 与 DSL API 设计，因为 ports/connections 是数据边界，后期补会破坏 hash 稳定性与迁移成本；A.2/A.4 可在阶段 6 一并设计；A.3/A.5/A.6 可作为独立增强项排期。

---

# 附录 B：A.1 落地稿 —— IR 工业语义 Schema（2026-07-26）

本附录把附录 A 的 P0 项（A.1）落成可直接进入阶段 2 的 IR schema 设计。原则：

1. **Core 纯数据、零依赖**：IR 类型只依赖 `Vec3`/`Quat` 等基本几何类型，不 import app 层 `process-line-types`，不 import Three.js。
2. **介质开放字符串 + 软校验**：core 不绑定封闭介质枚举；提供 `KNOWN_MEDIA` 常量集做 warning 级提示，未知介质不阻塞（行业可扩展），但拼写接近已知介质时给 hint。
3. **ports/connections 可选**：非工业对象（笔记本、家具）不产生 ports，schema 不强制；工业 category 由质量门强制要求。
4. **hash 稳定**：ports/connections 参与 part 与 assembly 的 fingerprint 计算，顺序无关（按 id 排序后哈希），保证"同 sourceHash+paramsHash 重跑 → 同 fingerprint"。

## B.1 类型定义（建议落在 `packages/core/src/lib/generated-assembly-ir.ts`）

```ts
// ── 基础几何类型（复用 core 既有，不在此重定义）──
// type Vec3 = [number, number, number]
// type Quat = [number, number, number, number]

/** 接口朝向：设备包络的六个面。与 ProcessEquipmentPortSide 对齐，外加 bottom。 */
export type IRPortSide = 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom'

/**
 * 工业接口（接管/端口/电缆口）。
 * 挂在一个 part 上，描述"这个部件在哪个面、什么高度、走什么介质、朝哪个方向接管"。
 */
export type IRPort = {
  /** 稳定身份，assembly 内唯一。建议 `${partId}.${name}`，如 `column_shell.feed_in`。 */
  id: string
  /** 所属 part。必须引用 parts[] 中存在的 id。 */
  partId: string
  /** 介质。开放字符串；见 KNOWN_MEDIA。 */
  medium: string
  /** 在所属 part 包络的哪个面。 */
  side: IRPortSide
  /** 接口中心距设备地面（y=0）的高度，米。 */
  height: number
  /** 沿所在面的横向偏移（米），缺省 0 = 面中心。 */
  offset?: number
  /** 接管朝向（单位向量，世界系）。缺省由 side 推导（面的外法线）。 */
  direction?: Vec3
  /** 接口公称直径（米），可选，用于管线直径匹配。 */
  nominalDiameter?: number
  /** 语义角色，如 'inlet'/'outlet'/'vent'/'drain'/'signal_power'。 */
  role?: string
}

/** 设备内/设备间的一条连接（管线/电缆/输送）。 */
export type IRConnection = {
  /** 稳定身份，assembly 内唯一。 */
  id: string
  /** 起点 port id。 */
  fromPort: string
  /** 终点 port id。 */
  toPort: string
  /** 介质。应与两端 port.medium 一致（不一致给 warning）。 */
  medium: string
  /** 视觉/工程形态：管线/电缆桥架/输送带等。开放字符串。 */
  kind?: string
  /** 关键路径点（世界系），可选；缺省由布线器自动路由。 */
  waypoints?: Vec3[]
}

/** 已知介质（软校验用，非穷举）。行业可自由扩展新介质字符串。 */
export const KNOWN_MEDIA = new Set([
  'water', 'hydrogen', 'oxygen', 'power', 'cooling',
  'material', 'gas', 'molten_metal', 'steam', 'oil',
  'air', 'signal', 'chemical', 'refrigerant',
])
```

## B.2 嵌入 AssemblyIR（对文档 §阶段2 IR 最小模型的增量）

```ts
export type AssemblyIR = {
  schemaVersion: 1
  generator: { sourceHash: string; apiVersion: string; paramsHash: string }
  parts: Array<{
    id: string
    semanticRole?: string
    parentId?: string
    transform: { space: 'world' | 'local'; position: Vec3; rotation: Quat; scale: Vec3 }
    geometry: GeometryRecipe | MeshBlobRef
    material: SerializableMaterial
    fingerprint: string
  }>
  constraints: Array<HingeConstraint | GridConstraint | AttachmentConstraint>

  // ── 附录 B 新增：工业语义（可选，工业 category 由质量门强制）──
  /** 设备接口表。无接口对象可省略。 */
  ports?: IRPort[]
  /** 连接表。仅当存在 ports 时有意义。 */
  connections?: IRConnection[]
  /** 工业元数据：该 assembly 对应的工艺契约标识（便于布线/避让贯通）。 */
  process?: {
    profileId?: string
    equipmentFamily?: string
    primarySemanticRole?: string
  }
}
```

## B.3 校验规则（建议落在 `generated-assembly-validation.ts`）

| 规则 | 级别 | 说明 |
| --- | --- | --- |
| `ir_port_id_unique` | error | port.id 在 assembly 内唯一 |
| `ir_port_part_exists` | error | port.partId 引用存在的 part |
| `ir_port_side_valid` | error | side ∈ 六面枚举 |
| `ir_port_height_finite` | error | height 为有限数；超出所属 part 高度包络给 warning `ir_port_height_outside_part` |
| `ir_port_direction_unit` | error | direction 若提供须为单位向量（容差 1e-3） |
| `ir_port_medium_known` | warning | medium 不在 KNOWN_MEDIA；若与某已知介质编辑距离 ≤1 给 hint（如 `hydorgen`→`hydrogen`） |
| `ir_conn_endpoints_exist` | error | connection.fromPort/toPort 引用存在的 port |
| `ir_conn_medium_match` | warning | connection.medium 与两端 port.medium 不一致 |
| `ir_conn_no_self_loop` | error | fromPort === toPort |
| `ir_conn_waypoints_finite` | error | waypoints 若提供须为有限 Vec3 |
| `ir_process_family_known` | info | process.equipmentFamily 提示（不阻塞） |

**确定性要求**：校验前先对 `ports`、`connections` 按 `id` 排序再计算 fingerprint，保证集合顺序不影响 hash。

## B.4 与现有数据的双向映射

**Contract → IR（DSL 生成时）**：`ProcessEquipmentContract.ports` 是设备级（不含 partId），DSL 编译器需把每个 contract port 落到具体 part——
- 优先按 `role`/`side`/`height` 匹配 `semanticRole` 相符的 part（如 `feed_in` → 壳体 part）；
- 无法匹配时落到 primary part，并在 diagnostics 给 `ir_port_part_inferred` info。
- contract 的 `side` 无 `bottom`，IR 侧 `bottom` 仅在 DSL 显式声明时出现，映射时不会冲突。

**IR → 布线/避让（生成后消费）**：IR.ports 可直接映射为 `ProcessRoutePortEndpoint`（stationId 由外层注入，point 由 port 的 part transform + side/height/offset 推导世界坐标），与 recipe/profile 路线的 `portOverridesFromNode` 输出同构，使 `connection-router` 对三条路线一视同仁（呼应 A.6 元数据贯通）。

## B.5 DSL API 增量（阶段 3）

`part()` builder 增加链式接口声明，返回 IR builder（不直接改场景）：

```ts
part('column_shell', cylindricalTank({ r: 1.2, h: 8 }))
  .at([0, 4, 0])
  .port('feed_in', { medium: 'oil', side: 'left', height: 5.2, nominalDiameter: 0.15 })
  .port('bottom_out', { medium: 'oil', side: 'bottom', height: 0.1, role: 'outlet' })

connect('feed_line', { from: 'preheat.out', to: 'column_shell.feed_in', medium: 'oil', kind: 'pipe' })
```

- `connect()` 引用的 port 必须已声明，否则编译期 `ir_conn_endpoints_exist` error。
- 循环/函数生成 ports 时，port.id 与 partId 同样要求确定性模板（含循环维度），禁止随机/时间戳。

## B.6 质量门新增（阶段 6，呼应 A.4 工程门）

- `gate_port_not_dangling`：声明了 connection 的 port 必须真实落在所属 part 包络表面（容差内），否则判"悬空接管"。
- `gate_port_side_consistency`：port.side 与其世界坐标的相对方位一致（如声明 `left` 却算出在 +X 面 → warning）。
- `gate_contract_port_coverage`：工业 category 下，contract.ports 的每个 id 在 IR.ports 中都有对应（缺失 → warning，呼应现有 `factory_primitive_port_missing`）。
- `gate_connection_routable`：connection 两端 port 世界坐标不与其它 part 包络冲突（粗判，供布线器前置过滤）。

## B.7 验收标准（并入阶段 2 / 阶段 6 完成定义）

1. 一个 DSL 生成的真空蒸馏塔 IR：`column_shell` 带 `feed_in`/`side_draw`/`bottom_out` 三个 port + 一条 `feed_line` connection，JSON 序列化往返后 fingerprint 稳定。
2. `connect()` 引用未声明 port → 编译期 `ir_conn_endpoints_exist`，不产生 artifact。
3. 重跑同 sourceHash+paramsHash → ports/connections 集合与 fingerprint 完全一致；删一个 port → IR diff 报 removed 且其 connection 一并标记 orphan。
4. IR.ports 映射为 `ProcessRoutePortEndpoint` 后，`connection-router` 能像对待 recipe/profile 设备一样完成布线（routeObstacle 与 port 世界坐标正确）。
5. 工业 category 下 contract 声明的 port 缺失 → 质量门 warning；非工业对象（无 ports）不受影响。

## B.8 明确不做（避免范围蔓延）

- 不做管线的水力/热力计算（压降、流量、应力）——IR 只记录拓扑与几何接口，工程计算留给下游。
- 不做端口标准件库（法兰等级/密封面）——`nominalDiameter` 仅作匹配提示。
- 不强制非工业对象声明 ports。


