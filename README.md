# DSH PM Workbench · 工作台 v2

DSH 右侧栏常驻的一个 tab。v2 把「待办清单」换成了**记事本式备忘**，并让备忘、项目、收件箱、日历、周报共用同一份数据。

- 规划与取舍：[docs/PLAN.md](docs/PLAN.md)
- 视觉：Material Design（紫色主色 + 宿主主题 token），深浅色都跟随宿主（`body[data-ds-dark-theme]`）。

## 五个 tab

| tab | 做什么 |
|---|---|
| **备忘** | 一句话/多行记事；可加多行备注；可设**每天重复**（完成则次日新建，未完成则把当前这条改到次日）；勾选后划线；标签（默认七种，含「项目」，或任意 `#标签`，支持新增/重命名/删除）；任意截止日期与时间；置顶、编辑、删除（2.6 秒撤销）；按全部/未完成/重要/今天筛选；置顶/逾期/今天/本周/以后/无日期/已完成分组；**点击卡片右侧滑出抽屉**，可「在对话中处理」或打开更多操作 |
| **日历** | 月视图 + 选中日议程；**只读投影**：备忘的截止日期、项目任务的截止日期都会自动出现在日历上，不在日历里单独添加日程。议程里可勾完成，点备忘跳回备忘，点项目任务直接打开任务编辑 |
| **项目** | 底部新增项目；项目内添加任务（负责人默认「我」、岗位、依赖、起止日期、进度）；甘特图展示时间线和多任务依赖；项目进度按任务平均计算 |
| **收件箱** | **多渠道收件箱**：顶部「全部 / QQ 邮箱」切换和「+ 添加渠道」；QQ 邮箱 IMAP **只读收信**，首次打开有配置引导；同步最近邮件、阅读正文；一键把邮件主题+正文加入待办（自动打「邮件」标签）。微信、钉钉、飞书、RSS 已预留渠道位，目前只实现 QQ 邮箱，且只读：不发送、不删除、不标记已读 |
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
- **每天重复**：编辑备忘时打开「每天重复」。当天完成 → 次日自动新建一条；当天没完成 → 次日把同一条的截止日期改到次日（不会复制出两条）。时间、标签、备注一起保留。
- **从待办转项目**：卡片「更多 → 新建项目」或卡片上的「转为项目」会把当前待办作为项目名并生成第一个任务；加上「项目」标签后，卡片左侧会有项目色条，和普通待办区分。仅勾「项目」标签只是标记，不会自动建项目；要建项目请点「转为项目」。
- **项目甘特图**：项目卡里按任务起止日期画横条，依赖用虚线箭头连接；点任务条或左侧名称编辑任务；拖动左侧 ⠿ 可以调整任务行顺序，依赖关系不变。
- **任务进日历**：项目任务的截止日期会出现在日历月视图和当天议程里，完成状态与任务进度同步。
- **标签管理**：标签行里的「管理标签」可新增、重命名、删除；重命名会同步所有备忘，删除会从所有备忘中移除。备忘编辑态里也能直接输入一个新标签。
- 解析在本地即时完成，不等模型；解析结果以 chip 显示，日期/标签可以在保存前改

### 长文本批量录入

- 输入多行或超过 50 字后，Enter / 发送按钮不再存成一条，而是打开 **AI 识别 / 拆分待办**：把整段话按语义拆成多条备忘，带日期/时间的直接写进截止日期，逐条勾选后一次保存（最多 12 条）。
- `Ctrl/Cmd + Enter` 始终按「一条」保存；拆分结果里也有「存为一条」。
- AI 不可用时退化为本地按行/句拆分，界面标注「本地识别」。
- 输入框下方的 AI chip 也会带着当前草稿直接进入拆分预览。

## 收件箱（多渠道）

- 收件箱按「渠道」组织：只接入一个渠道时直接显示该渠道列表；接入多个渠道后顶部出现「全部 / 各渠道」切换。
- 标题栏的「+」打开渠道面板，可以查看已连接渠道、断开连接，以及后续渠道；微信、钉钉、飞书、RSS/网页已预留为「即将支持」。
- 目前只有 QQ 邮箱，读取最近 10 封收件箱邮件，**只读**：不发送、不删除、不标记已读。
- 连接前先在 QQ 邮箱「设置 → 账户」开启 IMAP，并生成**授权码**；连接时填邮箱地址 + 授权码，不要填 QQ 登录密码。
- 授权码保存在 DSH 凭据服务里，本机 `storages/pm-workbench/inbox.json` 只保存邮箱地址和同步时间。
- 第一次打开工作台且未配置邮箱时，顶部会出现配置引导；也可以直接打开「收件箱」tab 配置。
- 邮件列表点开正文后，点「加入待办」会把主题作为待办正文，发件人/时间/正文放进备注，并自动加「邮件」标签。
- 全部渠道视图里每条消息会显示渠道来源；后续渠道接入后可以直接聚合到这个列表。



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
- **HTTP 路由沿用 DSH 自身门禁**：`/pm-workbench/ai`、`/data`、`/inbox` 在入口调用 `connection.requestRejection`，和 DSH API 共用 Host/Origin 与登录检查；未登录或来源不受信任的请求返回 401/403。
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
| `pm_project_list` | 项目、任务、负责人、岗位、依赖、进度 |
| `pm_project_create` | 新建项目 |
| `pm_project_update` | 改项目信息；`progress` 可统一设置所有任务进度 |
| `pm_project_task_add` | 加任务，支持 `owner`/`role`/`dependsOn`/`progress` |
| `pm_project_task_update` | 改任务进度、负责人、岗位、日期、依赖 |

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
├── tools.js              # 待办与项目工具（pm_memo_* / pm_project_*）
├── inbox.js              # QQ 邮箱只读收信（IMAP + 凭据存储）
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

收件箱依赖 `imapflow` 和 `mailparser`，已写进 `package.json`；本地开发如果没有在插件目录安装依赖，会自动尝试复用 DSH profile 里已安装的同名包。

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

