# Pascal Editor 项目长期记忆

## 构建时序（关键坑）

- `@pascal-app/core` 的 package.json exports 全部指向 `dist/`（`tsc --build` 产物）。
- **凡是在 `packages/core/src` 新增/修改文件后，必须 `cd packages/core && bun run build`，再重启 3002 dev server**，否则 Next.js 报 module-not-found（500）。
  - 2026-07-26 阶段 5 就因为新加的 `src/schema/nodes/generated-mesh.ts` 没编进 dist，导致 `POST /api/ai-harness/runs` 500。
- `packages/nodes` 同理，改了渲染器要 `bun run build`。
- `bun test` 直接跑 src，不经过 dist，所以单元测试测不出 dist 缺失问题——只能靠构建 + 重启 dev server 验证。
- **core 包内部（含 .test.ts）禁止用 `@pascal-app/core/...` 包名自引用导入**——自引用走 exports → dist，构建时 dist 不存在会 TS2307。必须用相对路径（`./xxx` / `../types`），惯例见 `src/schema/nodes/assembly.test.ts`。2026-07-26 `generated-mesh.test.ts` 踩过这个坑。
- **`@pascal-app/core` 的 exports 只暴露精确键（`.`、`./schema`、`./store`、`./lib/*` 通配…），不覆盖 `./schema/*` 深层子路径**。跨包引用 schema 类型/节点一律从 `@pascal-app/core/schema` 桶文件引（它 re-export 了 `AnyNode`/`AnyNodeId`/各节点 schema）。`@pascal-app/core/schema/types`、`@pascal-app/core/schema/nodes/xxx` 这种写法在 Next/turbopack 下 module-not-found；`bun test` 解析宽松发现不了。2026-07-26 阶段 5/6 四个文件踩坑后已全部纠正。

## 我的执行环境限制

- 本会话 shell（bash / PowerShell）完全损坏：所有命令返回空 stdout + exit 1，无法跑测试 / curl / bun。
- WebFetch 拦截 localhost（安全策略），无法探测用户的 dev server。
- 结论：所有需要执行命令的验证（测试、冒烟脚本、API 调用）都得写好脚本交给用户跑，让用户贴输出。

## Windows / bun 环境坑（2026-07-27 e2e 冒烟实录）

- `bun dev:editor`（=`bun --cwd apps/editor dev`）只是用 bun 当包管理器拉起 `next dev`，**Next fork 的 server 进程是纯 Node**——`process.execPath` 指向 node.exe，不能用来 fork TS worker。
- 用户机器 bun **不在 PATH**：PowerShell `where bun` 为空，但 cmd 的 `where bun` 返回 `D:\Program Files\nodejs\npm_global\bun`（npm 全局目录下的失效 shim，spawn ENOENT）。**解析可执行文件路径必须 `existsSync` 验证，不能信 `where/which` 的第一条命中**。
- fork TS worker 的正确姿势：收集 env 覆盖（`DSL_SANDBOX_EXEC`）/ PATH 命中 / 常见安装目录（`%USERPROFILE%\.bun\bin\bun.exe` 等）候选，逐一 `existsSync` 验证。实现见 `generated-geometry-sandbox-runner.ts` 的 `resolveBunExecPath`。
- 排查子进程崩溃第一步永远是**把 stderr pipe 出来**——`stdio` 全 ignore 等于蒙眼排错。

## 新增节点类型的隐藏清单（2026-07-27 build 实录）

往 `AnyNode` 加新节点类型（如 generated-assembly/generated-mesh）时，**四处注册缺一不可**：
1. `packages/core/src/schema/types.ts`：AnyNode 联合 + `schema/index.ts` 导出；
2. `packages/core/src/events/bus.ts`：`EditorEvents` 手工枚举加 `NodeEvents<'kind', XEvent>` + `XEvent = NodeEvent<XNode>` 类型 + import；
3. `packages/nodes/src/index.ts`：渲染器 definition 注册进 builtinPlugin.nodes；
4. `packages/viewer/src/hooks/use-node-events.ts`：事件 emit（自动从 AnyNode 推导，但依赖 2 的 EditorEvents）。

漏了 2 会在 build packages/nodes 时报 TS2345（eventKey 不可赋值）。改完 2 必须先 build core 再 build nodes。

## 已知问题：启动时 unreachable node warning（2026-07-28 分析）

根因：`use-scene.ts` 的 `setScene` 在加载时做可达性清理（`normalizeRootNodeIds` + `collectReachableNodeIds`），但 `prepareSceneGraphForSave` 保存时只过滤 isTransient 节点，不做可达性清理。运行中产生孤儿节点 → autosave 原样保存 → 下次启动再清 → 循环。

修复：在 `prepareSceneGraphForSave` 加二阶段清理——先剥 transient，再做可达性清理，阻止孤儿节点被持久化。

涉及的改动：`packages/editor/src/lib/scene-save.ts` 添加 `collectReachableNodeIds` + `getNodeChildIds` 函数，在 `prepareSceneGraphForSave` 里加了二阶段清理逻辑。
