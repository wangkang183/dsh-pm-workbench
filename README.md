# DSH PM Workbench · 工作台 v2

DSH 右侧栏常驻的一个 tab。v2 把「待办清单」换成了**记事本式备忘**，并让备忘、日历、周报共用同一份数据。

- 规划与取舍：[docs/PLAN.md](docs/PLAN.md)
- 视觉：Material Design（紫色主色 + 宿主主题 token），深浅色都跟随宿主（`body[data-ds-dark-theme]`）。

## 三个 tab

| tab | 做什么 |
|---|---|
| **备忘** | 一句话/多行记事；可加多行备注；勾选后划线；标签（默认六种，或任意 `#标签`，支持新增/重命名/删除）；任意截止日期与时间；置顶、编辑、删除（2.6 秒撤销）；按全部/未完成/重要/今天筛选；置顶/逾期/今天/本周/以后/无日期/已完成分组；**点击卡片右侧滑出抽屉**，可「在对话中处理」或打开更多操作 |
| **日历** | 月视图 + 选中日议程；**只读投影**：备忘有截止日期就自动出现在日历上，不在日历里单独添加日程。议程里可勾完成，点条目跳回备忘 |
| **周报** | 本周完成/新增/进行中/重要四个数字；**AI 总结本周工作内容**（完成/推进/风险/下周）；按周缓存；可复制 Markdown；AI 不可用时自动降级为本地统计 |

**信息跟踪（关键词、扫描、时间轴、可信度定级）已整体删除**，Host 的 `/pm-workbench/scan` 路由也一并移除。

## 录入语法

```text
明天下午 3 点跟设计对齐会员改版 #重要
周五前补验收标准 #会员 #紧急
下周一 10:00 周会
10-30 交季度报告
记一下：空状态文案再想一版
```

- 日期：今天/明天/后天/大后天、N 天后、周一…周日、本周X、下周X、10月30日、10-30、2026-12-01、月底
- 时间：15:30、下午 3 点、晚上 8 点半、早上 9 点；有日期没时间 = 全天
- 标签：`#任意标签`，或点输入框下方的快捷 chip
- **备注**：编辑备忘时可填多行备注；卡片上会显示备注，长备注可滚动查看。微信/对话里的 `pm_memo_add`/`pm_memo_update` 也支持 `note`。
- **标签管理**：标签行里的「管理标签」可新增、重命名、删除；重命名会同步所有备忘，删除会从所有备忘中移除。备忘编辑态里也能直接输入一个新标签。
- 解析在本地即时完成，不等模型；解析结果以 chip 显示，日期/标签可以在保存前改

### 长文本批量录入

- 输入多行或超过 50 字后，Enter / 发送按钮不再存成一条，而是打开 **AI 识别 / 拆分待办**：把整段话按语义拆成多条备忘，带日期/时间的直接写进截止日期，逐条勾选后一次保存（最多 12 条）。
- `Ctrl/Cmd + Enter` 始终按「一条」保存；拆分结果里也有「存为一条」。
- AI 不可用时退化为本地按行/句拆分，界面标注「本地识别」。
- 输入框下方的 AI chip 也会带着当前草稿直接进入拆分预览。

## AI 怎么工作

客户端只发一个请求：

```text
GET  /pm-workbench/ai   → 当前会用哪个 provider/model（健康检查）
POST /pm-workbench/ai   → { task: 'parse' | 'summary', ... }
```

Host 侧：

1. 模型路由顺序：`agentDefaultModel.currentSelection()` → 活跃会话的 provider/model → 任意已注册 provider 的第一个模型。
2. 调用 `ctx.llm.stream()`，请求模型支持的最低 reasoning 档位，输出上限 1600 tokens，45 秒超时。
3. 强制 JSON 输出；Host 剥代码围栏、清洗字段，客户端再做一次白名单校验。
4. 失败一律返回可降级的结果：`parse` 用本地规则按行/分号拆条；`summary` 用本地统计生成同样的四组结构，并在 UI 上标注「本地」。

浏览器不接触密钥，也不直连模型服务。路由只在同源页面可用（不返回 CORS 头），第三方页面无法调用它消耗模型额度。

## 数据

- **Host 文件是共享数据源**：`$DSH_HOME/storages/pm-workbench/workbench.json`。浏览器 localStorage 只作为缓存；打开工作台时会把旧缓存与 Host 合并，之后本机编辑会同步到 Host，Host 工具/微信改动会轮询回 UI。
- 存储键 `dsh.pm-workbench.v2` 仍保留；首次打开会读取旧键 `dsh.pm-workbench.v1`，把旧 `todos` 转成备忘（标题、标签、截止日、完成态），`keywords`/`intel` 直接丢弃。
- 周报按周一日期缓存在 `reports`，重新生成会覆盖。
- **升级后请打开一次工作台**：旧 localStorage 数据需要这一下才会迁移到 Host；之后微信/IM 才能读到同一份待办。

## 对话与微信/IM

### 一键送进对话

点击任意备忘卡片，右侧滑出操作抽屉：「对话」把该条待办的正文、标签、截止日期、状态和 id 作为提示词追加到当前会话输入框并直接发送；「更多」里有置顶/编辑/删除。agent 处理时会用 `pm_memo_update` 回写状态。

### 微信/IM 自然语言

任意 DSH agent（包括 `dsh-im` 接入的微信机器人）都可以直接调用 Host 工具：

| 工具 | 用途 |
|---|---|
| `pm_memo_list` | 查看待办：按未完成/已完成、今天/逾期/本周、标签、关键词筛选，返回 id |
| `pm_memo_add` | 新增一条或多条待办（支持相对日期换算后的 `dueDate`/`dueTime`） |
| `pm_memo_update` | 完成/重开、改正文、标签、截止日期、置顶；按 id 或唯一文本片段 |
| `pm_memo_delete` | 删除，必须显式 `confirm:true` |
| `pm_workbench_stats` | 未完成、今天、逾期、本周、本周完成、重要与标签分布 |

示例：

- 微信发「今天还有什么待办？」→ agent 调 `pm_memo_list({due:'today'})`
- 「把设计对齐那条标完成」→ `pm_memo_list` 拿到 id → `pm_memo_update({id, done:true})`
- 「记一下：周五前给老王验收标准 #重要」→ `pm_memo_add`
- 「这周完成了多少？」→ `pm_workbench_stats`

前提：微信机器人使用的 Agent Preset 允许工具调用（标准 preset 默认允许），并且 Host 已加载本插件。

## 文件

```text
pm-workbench/
├── package.json          # dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # insert 一行
├── index.js              # Host：AI 路由 + 数据路由 + 工具注册
├── store.js              # Host 共享存储（$DSH_HOME/storages/pm-workbench）
├── tools.js              # pm_memo_list/add/update/delete、pm_workbench_stats
├── client.js             # 全部 UI、本地逻辑与 Host 同步
├── locale/{zh,en}.json
├── icon.svg
└── test/
    ├── smoke.mjs         # 注册链路
    ├── core.mjs          # 解析 / 分组 / 周统计 / 迁移 / AI 结果清洗
    ├── host.mjs          # AI 与数据路由、baseRev 冲突
    └── tools.mjs         # 工作台工具的新增/查询/更新/删除/统计
```

## 安装与更新

在 DSH 的「插件 → 添加插件」里选择本目录，或：

```text
plugin_manager { action: "install_bundle", target: "<绝对路径>/pm-workbench" }
```

也可以在终端执行 `dsh plugin --profile <profile> add <绝对路径>/pm-workbench`。

已安装时，改动文件后**刷新页面**即可加载新 client；Host 路由或工具改动需要重新加载插件（禁用再启用）或重启 DSH。

首次安装：

```text
plugin_manager { action: "install_bundle", target: "<绝对路径>/pm-workbench" }
```

或 `dsh plugin --profile desktop add <绝对路径>/pm-workbench`。

回滚：删掉 `cordis.patch.yml` 里的 `pm-workbench` insert 行和 `dsh.profile.bundles` 条目；localStorage 数据不会丢。

## 验证

已做：

- `node --check client.js / index.js / store.js / tools.js`
- `test/smoke.mjs`：tab 类型、pane body、session header 启动器全部注册
- `test/core.mjs`：日期/时间/标签解析、分组、周统计、日历合并、迁移、AI 结果清洗
- `test/host.mjs`：AI 路由、数据路由、baseRev 冲突
- `test/tools.mjs`：工具的新增/查询/更新/删除/统计
- 300px 单列的组件结构按 CSS 固定；未做真实页面截图验证

未做（需要真实页面/可用模型）：

- 右侧栏 300–480px 的实际排版与深浅色对比
- 一键「对话」按钮在真实会话中的发送效果（需要页面）
- 微信机器人实际调用 pm_* 工具的端到端链路（需要微信侧发消息）
- `/pm-workbench/ai` 在真实默认模型下的返回质量与延迟
- 桌面 `dsh-app://` 外壳下 Host 同源请求是否可达（旧版同样限制）

## 已知取舍

- 语言按 `navigator.language` 切换中英文，未接 `ctx.locale`。
- 数据仍在 localStorage：换取零迁移成本，代价是 agent 读不到。需要时再迁 Host 存储域。
- 月视图固定 6 行，窄栏下优先保证日期可点，不做周视图。
