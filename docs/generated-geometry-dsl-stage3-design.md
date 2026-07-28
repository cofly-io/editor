# 阶段 3 设计确认：DSL 语法载体 + Prompt contract

> 决策日期：2026-07-26
> 状态：已确认（用户签字于会话）
> 范围：`GENERATED_GEOMETRY_DSL_DEVELOPMENT_PLAN0722.md` §9 的全部 4 个确认点

## 1. DSL 语法载体：受限 TypeScript-like 文本

**选择**：TypeScript 表达式级子集，纯文本。

**允许的语法**：
- 字面量：number / string / boolean / array / object（无 prototype 链访问）
- `const` 声明（不允许 `let` / `var`，避免可变状态带来的不确定性）
- `function` 声明与箭头函数（仅一等函数，无闭包捕获外部 mutable）
- `for (const x of iterable)` 与经典 `for (let i = 0; i < n; i++)`
- `if / else`（含三元）
- 数组方法白名单：`map / filter / reduce / slice / concat / flat / flatMap / entries / keys / values`
- 数学命名空间 `math.{sin,cos,tan,sqrt,pow,abs,min,max,floor,ceil,round,hypot,PI}`（注入，不允许 `Math.` 大写形式）
- 模板字符串**禁止**（避免运行时拼接逃逸面），只允许字符串字面量与 `str.concat` / `+`

**禁止的语法**：
- `import / require / export`
- `class / new / this / super / prototype`
- `try / catch / throw`
- `async / await / Promise / yield`
- `eval / Function / Reflect / Proxy / Symbol`
- `for-in`、`with`、`label`、`goto` 类语法
- 正则字面量
- 全局对象访问：`globalThis / window / self / process / require / fetch / XMLHttpRequest / Date / Math.random / performance / console`
- 任何 `__proto__` / `constructor` / `prototype` 属性访问

**理由**：
- LLM 训练分布里 TS 远多于任何 DSL，首次编译成功率上限更高
- 子集小而易白名单，AST 层面可拒绝未授权语法
- 文本形式 vs JSON AST：token 经济、可读、模型熟悉的 few-shot 形态

## 2. 执行模型：编译期静态求值，不真执行

**选择**：DSL source → 自研受限 evaluator → 直接产出 `AssemblyIR`。不在 sandbox 跑 LLM 代码本身；sandbox 跑的是**这个 evaluator**。

**理由**：
- DSL 是声明式几何构造，无副作用，可以纯静态求值
- Evaluator 是可信代码，无沙箱逃逸面
- 输出 IR 即"编译产物"，契约清晰
- 阶段 4 sandbox 的隔离对象 = evaluator 进程 + 资源预算，而不是 LLM source 本身的运行时

## 3. Prompt contract

### 3.1 API 卡片格式（YAML）

```yaml
apiVersion: 1.0.0
kind: geometry_api_card
id: primitive.box
category: primitive
signature: box(opts: { length, width, height, material? }): GeometryBuilder
inputs:
  length: { type: number, unit: m, required: true, range: [0, ∞) }
  width:  { type: number, unit: m, required: true, range: [0, ∞) }
  height: { type: number, unit: m, required: true, range: [0, ∞) }
  material: { type: MaterialPreset, required: false }
outputs: GeometryBuilder
cost: { parts: 1, vertices: 24, indices: 36 }
example: |
  part('base', box({ length: 0.35, width: 0.24, height: 0.02, material: 'metal' }))
    .at([0, 0.01, 0])
```

### 3.2 注入策略

- **核心 API 集**始终注入（约 8 张卡片：`part / box / cylinder / sphere / at / rotate / scale / material`）
- **按 category 检索**：`generationMode=generator_dsl` + `category=laptop` → 检索 `hinge / grid / lathe / extrude` 等相关卡片
- **按 generationMode 检索**：`generator_dsl` → 加入 `params / connect / port` 卡片；`recipe` → 不注入
- 单次 prompt 卡片数 ≤ 16

### 3.3 few-shot fixture 提升规则

- 只能从**通过 IR 校验 + sandbox 校验 + 空间质量门**的 run 中提升
- 每个 fixture 包含：DSL source / params / 期望 IR hash / 期望 diagnostic 集（应为空）/ category 标签
- 提升时同时记录：API version、模型版本、prompt 模板版本
- 任何 fixture 在 API 升级后必须重跑通过才能保留，否则进入 deprecated/

### 3.4 模型诊断 JSON

```json
{
  "code": "dsl_undeclared_identifier",
  "severity": "error",
  "span": { "start": 142, "end": 149, "line": 7, "column": 12 },
  "expected": "a declared param, local const, or whitelisted API",
  "actual": "keycaps",
  "hint": "did you mean 'keycapWidth'?",
  "retryable": true
}
```

机器可读字段完备；用户摘要在 executor 层本地化生成，**不暴露堆栈、不暴露宿主路径**。

### 3.5 成功度量

记录字段：`firstCompileSuccess / firstQualityGatePass / fixedWithin3Turns / diagnosticCode分布 / avgTokensPerRun / avgFixTurns`，按 `(apiVersion, modelVersion, category, fixtureSetVersion)` 分桶。

## 4. params 契约

```ts
params({
  keycapWidth: {
    type: 'number',
    unit: 'm',
    range: [0.014, 0.025],
    default: 0.018,
    semanticRole: 'keyboard.key.width',
    affects: 'keyboard.key.*',
    label: '键帽宽度',
  },
  columns: {
    type: 'integer',
    range: [10, 15],
    default: 12,
    semanticRole: 'keyboard.layout.columns',
    affects: 'keyboard.key.*',
    label: '键盘列数',
  },
})
```

**必填**：type / default / semanticRole / affects / label
**可选**：unit / range / enum
**affects 语法**：精确 partId、glob `*`（单段）/ `**`（多段），或语义角色前缀 `role:keyboard.key`

**修订路由**（§附录 A.2 三类）：
- (a) 参数级 → 改 params 重跑（影响范围大，如"键盘多一列"）
- (b) 部件级 → 直接写 partId override，不重跑（"盖子改红色"）
- (c) 结构变更 → 重跑 + IR diff（增删部件）

**歧义阈值**：用户修订语句解析为候选参数集合，若 |候选| > 1 且最高置信度差 < 0.15，返回候选清单让用户选，不擅自改 source。

## 5. 灰度门槛（初次灰度目标）

按文档 §阶段 6 验收：
- 单次 sandbox wall time ≤ 5 s
- 端到端非 LLM 渲染/提交 P95 ≤ 2 s
- 单次 ≤ 256 parts、≤ 50 万 vertices、≤ 150 万 indices、≤ 64 MiB mesh
- 上线前 2 周基线
- 首轮编译成功率 ≥ 70%
- 3 轮内修复率 ≥ 85%
- 通过空间质量门的已编译 run ≥ 90%

未达标不扩大灰度。
