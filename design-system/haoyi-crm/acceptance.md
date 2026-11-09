# 浩宜 CRM UI 规范验收

本清单用于规范、独立样板以及后续业务页面迁移。**清单不等同于检查已通过**：只在执行后填入结果与证据。最新结果为 2026-11-06 的 v1.1；下方第 1—7 节保留 2026-11-05 的 v1 历史记录，不将历史结果直接视为新版通过证明。

## v1.1 玻璃材质与控件升级验收（2026-11-06）

范围为现有独立样板和规范：86%／92% 玻璃操作层、实色内容层、三档阴影、原生语义选择控件、桌面 Select／手机原生选择、分段滑块和透明度设置。保留角色、分页、数据口径及业务行为；生产页面未迁移。

| 检查 | 实际结果 |
| --- | --- |
| TypeScript、lint | 通过；全项目检查，无新增依赖 |
| 单元／组件测试 | 9 文件 65 项通过，`npm.cmd test -- --maxWorkers=1`；覆盖半选、下拉键盘／原生适配、字段关联、隐藏表单代理、radio 分组焦点循环、显示偏好与业务回归 |
| 两种构建 | `npm.cmd run build`、`npm.cmd run build:ui-spec` 通过；普通产物扫描未发现 `hy-spec`、`hy-glass`、样板入口，原 ChinaMap3D 体积未改变 |
| 页面与断点 | 7 页 × 375／390／768／1024／1440／1920px，共 42 组合，无整页横向溢出、空页、框架错误遮罩或控制台错误；无外部／业务 API 请求 |
| 核心浏览器交互 | 9 组流程及 1 条尺寸记录通过：选择／筛选／加载／密度，下拉键盘，抽屉内菜单，草稿保护，校验与防重复提交，手机选择，目录控件，透明度持久化，高对比／减弱动态与等效缩放 |
| 选择与密度 | 桌面／手机共用全选与半选；筛选清空选择；普通记录实测 48／40px，手机保持卡片布局 |
| 弹层 | 菜单实际位于所属 dialog 内，受视口边界约束；第一次 Esc 关闭菜单，后续关闭走草稿保护；连续 15 次 Tab 不漏出，取消后焦点回触发器 |
| 触控 | 390px 下七页可见交互目标均达到 44×44px；透明原生输入通过完整命中区域交互 |
| 材质对比度 | 24 组检查通过，其中导航／顶栏／操作栏使用最终截图合成背景像素；普通文字最低 4.71:1，控件边界最低 3.387:1。仅代表检查的实际配色与背景，不作为任意背景下的保证 |
| 降级 | 手动降低透明度保持至刷新并作用于 portal；移除渐进增强块模拟无 backdrop 支持后为实色；浅／深系统强制颜色与减少透明度组合可读，深色浮层实测黑底白字；减少动态时取消滑块与装饰运动 |
| 滚动 | Edge 下记录 45 帧滚动，未观察到 long task；无逐行／单元格 backdrop-filter。该检查不代表所有硬件的性能验收 |
| 200% | 720×450 等效 CSS 视口下可筛选、无整页横滚；未进行人工浏览器菜单 200% 缩放 |

本轮修复了选择框 hover 覆盖选中底色、radio 未选组误命中 `:indeterminate`、降低透明度覆盖系统 Canvas、桌面 Select 撑满工具栏、隐藏 select 进入焦点循环和手机抽屉边框多出 1px 等问题。目录标题精简，状态矩阵与真实交互对应；AGENTS.md 原中英文句子各保留一次。

环境：Windows、本机 Edge（Playwright `channel: msedge`）无头浏览器；Browser 插件不可用，使用工程现有 Playwright，未下载浏览器。未执行 Safari、Firefox、真实手机、人工读屏和真实中文输入法的选择器定位验收；中文字符定位使用合成键事件，其他导航使用实际键盘事件。

截图与可重跑的本地检查脚本位于：
`C:/Users/Administrator/.codex/visualizations/2026/11/05/01a1aadd-e309-71d3-b315-42806187dced/crm-ui-glass-qa/`

| 证据 | 文件 |
| --- | --- |
| 桌面／手机最终列表 | `desktop.png`、`mobile.png` |
| 控件矩阵与局部细节 | `control-matrix.png`、`control-matrix-mobile.png`、`controls-detail.png` |
| 抽屉与嵌套菜单 | `drawer-select.png`、`drawer-mobile.png` |
| 七页桌面／手机 | `overview`、`leads`、`detail`、`studio`、`research`、`tasks`、`catalog` 的 `-1440.png`／`-390.png` |
| 降级与缩放 | `opaque.png`、`unsupported-fallback.png`、`forced-colors.png`、`forced-colors-dark.png`、`zoom-200-equivalent.png` |
| 布局／交互／材质／配色 | `layout-results.json`、`interaction-results.json`、`material-results.json`、`contrast-results.json` |

预览：`http://127.0.0.1:5174/ui-spec.html`；入口、命令及生产隔离方式继续沿用。

## 1. 本轮验收范围

- 规范文档：MASTER、组件、页面／权限、图表、验收五部分相互一致，根 AGENTS.md 保留要求的英文和中文原句。
- 独立样板：`ui-spec.html` 与 `src/ui-spec/`，本地 fixture；不使用真实账号、客户资料、凭据或业务 API。
- 独立命令：`npm.cmd run dev:ui-spec` 与 `npm.cmd run build:ui-spec`；样板构建输出 `dist-ui-spec`，普通业务构建不含样板。
- 本轮不包含全站视觉替换、线上部署、新统计接口、业务权限调整或生产数据验收。

## 2. 视觉与响应式

| 检查项 | 通过标准 | 本轮状态 |
| --- | --- | --- |
| 固定设计值 | 色彩、字体、间距、圆角与 MASTER 一致；不存在样板范围外全局覆盖 | 通过；危险标签追加深色文字变量 |
| 桌面 1440×900 | 完整侧栏、工具条、表格、详情与图表布局稳定；主要操作可见 | 通过 |
| 大桌面 1920×900 | 页面不整页横滚；多列信息保持阅读次序 | 通过 |
| 平板 1024×900、768×900 | 导航按断点收起；内容不被导航或浮层遮挡 | 通过 |
| 手机 390×844、375×900 | 抽屉导航、单列表单、列表卡片／局部横滚表格可操作 | 通过 |
| 极长内容 | 中文长名称、长编号、多个标签不破坏操作列或卡片宽度 | 通过；含长中文名称、0与空金额 |
| 字体与缩放 | 系统字体缺失时正常回退；200% 缩放仍能操作，不裁切主要内容 | 720×450 等效 200% CSS 视口通过；未做人工浏览器菜单缩放 |
| 密度切换 | 48 px 标准／40 px 紧凑行正确；移动端不压缩触摸目标 | 通过；实测普通记录 48/40 px，长名称自适应增高 |
| 视觉状态 | 默认、hover、focus、pressed、disabled、loading、selected 与 error 可区分 | 组件实现核对，核心状态交互通过 |
| 减弱动态 | 系统 reduced-motion 开启后移除非必要运动；内容依旧完整 | 通过；reduced-motion 开启检查 |

## 3. 交互与业务状态

| 场景 | 通过标准 | 本轮状态 |
| --- | --- | --- |
| 按钮提交 | loading 时阻止重复触发、宽度稳定，结束后反馈清楚 | 通过；loading 禁止重复触发并保留原宽度 |
| 字段校验 | 字段标签可见，错误关联控件；首次提交定位第一个错误，失败不清空输入 | 通过；字段关联、错误定位、保留草稿 |
| 搜索、筛选、排序 | 结果与条件一致；清空条件可恢复；空记录与筛选无结果分开 | 通过 |
| 表格选择 | 当前页选择范围明确；批量区只在有选中项时出现 | 通过；筛选变化清选择 |
| 行交互 | 行内按钮／链接／复选框不会触发行导航，键盘能访问全部操作 | 通过；选择和查看独立 |
| 分页 | 页码／游标反映当前数据模式；样板不冒充跨页真实批量能力 | 通过；模拟 cursor 加载 8→12 条 |
| 对话框／抽屉 | 打开后焦点进入，Tab 不漏出，Escape 和关闭行为正确，关闭后返回触发点 | 通过；12 次连续 Tab、Esc、关闭与焦点恢复 |
| 危险确认 | 对象、后果和必要原因明确；默认焦点避开危险确认按钮 | 通过；草稿确认默认继续编辑，危险操作默认取消 |
| 未保存内容 | 有修改关闭时可保存／放弃；没有修改不重复确认 | 通过；取消与 Esc 使用同一保护流程 |
| 加载／错误／重试 | 初次失败可重试；刷新失败不把旧成功数据误标为新数据 | 通过；含失败、离线、空态、冲突与核对后重试 |
| 无权限 | 与空数据区分；受限操作不伪装成功，角色演示不访问真实身份 | 通过；角色导航和写入口差异 |
| 研究状态 | 排队、运行、受阻、失败、完成、停止可表达；不虚构进度百分比 | 已核对状态实现；研究生成待办跨页检查通过 |
| 并发与幂等说明 | 样板说明状态冲突／待核对，不声称验证过生产并发 | 已明确样板边界；未测试生产并发 |

## 4. 图表与可访问性

| 检查项 | 通过标准 | 本轮状态 |
| --- | --- | --- |
| 数据来源 | 样板明显标识示例数据；真实接口支持与未来缺口在 charts.md 分开 | 通过；无业务 API/OIDC/外部网络请求 |
| 数值口径 | 阶段存量不叫转化率；培训记录不写人数／门店；预计金额不叫收入 | 静态核对通过 |
| 空值与错误 | 0、null、未知、无权限、失败分别表达；分母为零不伪造 0% | 组件测试通过；0与null分别显示 |
| 图表轴与尺寸 | 柱图从零起轴，不用最小柱宽夸大数值；轴、图例、标签无重叠 | 实现与截图核对通过 |
| 替代表格 | 同一数据驱动图形与表格，键盘和触摸都能取得必要数值 | 组件测试与浏览器通过 |
| 组合指标 | 必要来源缺失时不显示完整合计，原业务和公开线索不未经去重相加 | 局部来源失败时不显示完整总数检查通过 |
| 金额与预算 | 金额业务名称、单位明确；预留预算与已花费分开；退款正确解释 | 已核对固定样例；预留和已使用分开 |
| 对比度 | 文字与实际底色满足 4.5:1／大字 3:1；必要边界／图形满足相应非文字要求 | 12 组语义配色通过；正文≥4.5、控件边框3.42 |
| 键盘与焦点 | 所有交互可键盘操作，focus-visible 可见；固定区域不遮挡焦点 | 弹层循环、确认焦点、章节切换检查通过 |
| 标签和反馈 | icon-only 有名称；表头、字段、错误、状态反馈语义正确 | 字段关联、表格语义和状态反馈检查通过 |
| 触摸尺寸 | 手机交互目标至少 44×44 px，邻近操作不会误触 | 390px下七页可见控件实测≥44×44；复选框按label命中区域计 |
| 读屏人工检查 | 弹窗名称、字段错误、状态更新和图表替代有正确朗读顺序 | 未执行 |

## 5. 执行命令与证据要求

在 `apps/franchise-portal` 执行项目相关检查：

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run build:ui-spec
npm.cmd run dev:ui-spec
```

构建只证明编译和打包结果；组件测试只证明覆盖到的交互；浏览器人工／自动检查需另列范围。任何失败先记录，不能因为另一项通过就省略。已有测试失败要注明是否由本轮引入；未执行检查写“未执行”。

浏览器访问 `http://127.0.0.1:5174/ui-spec.html`，覆盖导航、列表、表单、详情／浮层、图表、研究／反馈等样板场景，检查控制台错误、资源失败和网络请求。不得存在业务 API／OIDC 请求，除了本地静态资源与开发服务器连接。记录实际测试视口、结果、截图／日志路径。

### 执行结果记录

| 检查 | 结果 | 证据／说明 |
| --- | --- | --- |
| 文档结构与相对链接 | 通过 | 五份文档存在、相对链接目标存在、代码围栏配对；AGENTS.md 英中原句各保留一次 |
| 文档与实际组件接口核对 | 已核对当前版本 | 已逐项读取 components.tsx 的导出类型与默认值，包含 Dialog footer 的 requestClose 函数；后续接口变化须再同步 |
| lint | 通过 | npm.cmd run lint，无错误／警告 |
| 单元／组件测试 | 通过 | 8 文件 48 项：原业务29项＋样板19项；全量使用 --maxWorkers=1 |
| 普通业务 build | 通过 | tsc -b 与 Vite；原有 ChinaMap3D chunk 大于500kB提示保留；产物不含样板入口、fixtures或tokens |
| 独立样板 build | 通过 | 输出 dist-ui-spec/ui-spec.html 与独立静态资源 |
| 浏览器桌面／移动交互 | 通过 | Playwright + 本机 Edge；7页×6宽度=42组合；14组业务／组件交互；无控制台错误或框架错误遮罩 |
| 对比度与键盘检查 | 通过（自动与视觉核对范围） | 12组配色、44px触控目标、Tab循环、Esc和返回焦点；人工读屏另列 |
| 读屏人工检查 | 未执行 | 不以自动化检查替代人工读屏验收 |
| 全站业务迁移／生产发布 | 不在本轮范围 | 本轮仅交付规范和独立本地样板 |

## 6. 后续接入业务页面的门槛

真实业务接入时重新检查服务器角色、响应结构、分页模式、更新冲突、状态映射、数据口径及移动行为。主样板的本地状态演示不能替代这些集成验收。涉及公共客户资料、禁止联系或合同收付款的动作继续使用既有服务端规则，不由前端演示数据推断授权。

## 7. 本轮修复与证据

- 危险状态原定红字/浅红底对比度4.41:1，独立深色文字token修正为5.91:1，危险按钮保留原色。
- 原生dialog连续Tab会把焦点移向浏览器工具栏，补充显式焦点循环及回归测试。
- 列表实际行高收敛到48/40px；紧凑模式仅隐藏次要副行，长名称可自然增高。
- 手机卡片的选择区及名称操作扩大到44px；保留读屏名称，去除重复可见说明。
- 首次并行运行出现原App待办测试等待超时；原文件18项重跑通过，随后全量串行48项通过。未修改业务测试断言。

截图和自动检查记录位于本机任务输出目录：
`C:/Users/Administrator/.codex/visualizations/2026/11/05/01a1aadd-e309-71d3-b315-42806187dced/crm-ui-qa/`

| 证据 | 文件 |
| --- | --- |
| 桌面列表最终效果 | desktop-final.png |
| 手机卡片最终效果 | mobile-final.png |
| 手机编辑抽屉 | drawer-mobile-final.png |
| 七页桌面／手机全页截图 | overview、leads、detail、studio、research、tasks、catalog 的 -1440.png / -390.png |
| 42组合布局结果 | layout-results.json |
| 14组交互结果 | interaction-results.json |
| 配色对比度 | contrast-results.json |
| 触控目标／键盘与等效缩放 | touch-targets.json、zoom-200-equivalent.png |

Browser插件不可用，使用项目已有Playwright和本机Edge；未下载新浏览器。仅验证该浏览器内核，未执行Safari、Firefox和真实手机验收。

## 8. 本地预览布局与动效优化（2026-11-06）

本轮仅优化独立样板。依据 ui-ux-pro-max 的 Bento Box Grid、Data-Dense Dashboard、Table Handling、Stagger List 与 Reduced Motion 建议，重排概览主次，合并经营指标、收起演示控制、稳定客户表关键列宽，并增加一次性页面／卡片／图表／列表／浮层动效。业务数据仍来自本地 fixture，未接入业务 API 或 OIDC。

| 检查 | 结果 | 本轮证据与范围 |
| --- | --- | --- |
| lint | 通过 | `npm.cmd run lint` |
| 单元／组件测试 | 68 项通过，9 个文件 | `npm.cmd test -- --maxWorkers=1 --testTimeout=15000`；首次默认 5 秒上限下一个多步列表测试超时，未修改断言，调整运行时上限后全量通过 |
| 样板与业务构建 | 均通过 | `npm.cmd run build:ui-spec`、`npm.cmd run build`；普通构建不存在 ui-spec.html，资源中不含新增样板布局／动效标识 |
| 页面身份、内容、错误覆盖层 | 通过 | 7 页 × 1440／1024／768／390px，共 28 组合；逐页核对 h1，无空白／Vite 错误遮罩 |
| 响应式布局 | 通过 | 28 组合无整页横向溢出，卡片结束态可见；390px 客户列表为卡片，Select 为原生分支，编辑抽屉宽 390px |
| 核心交互 | 通过 | 月份与图表/数据表切换；不完整汇总与恢复；客户筛选清选择、密度保存、必填校验、未保存保护；经营查看无写入按钮；手机导航 |
| 表格更多菜单 | 通过 | 末行菜单 portal 到表格外，视口内完整可见；取消归档回到触发点；方向键／End／Esc 可操作 |
| 动效与键盘 | 通过（所测路径） | 卡片静止态 opacity=1；连续 12 次 Tab 未重播 hy-motion-rise/fade；不通过数字递增伪造数据 |
| 减少动态与强制颜色 | 通过 | 对应媒体模式下活动动画为 0，金额及卡片仍完整可见 |
| 降低透明度 | 通过 | 顶栏背景为不透明白，backdrop-filter 为 none |
| 控制台与请求隔离 | 通过 | 测试未记录页面或控制台错误，无外部／业务 API／身份请求 |

IAB 用于实际视觉复核；项目已有 Playwright 与本机 Edge 用于多尺寸和媒体模式自动检查，未安装依赖。上述结果不等于真实手机、其他浏览器、人工读屏或线上业务验收。

本轮脚本、截图和结构化结果位于：
`C:/Users/Administrator/.codex/visualizations/2026/11/06/01a1ae79-d5f9-72a2-9f67-8b9a747219bd/`

- 脚本：`ui-refinement-qa.cjs`
- 结果：`ui-refinement/results.json`
- 截图：`overview-1440.png`、`leads-1440.png`、`research-1440.png`、对应 `-390.png`，以及 `drawer-390.png`、`reduced-motion.png`、`forced-colors.png`（均在 `ui-refinement/` 内）。

## 9. 正式页面液态玻璃与空间层次升级（2026-11-06）

本轮范围为正式工作台、新页面及旧 CRM 的材质与动效升级。首页将五指标与待办组合，下方保留原双栏；经营概览保留地图和业务分区。正式浮层补完整进入、退出及内容保留生命周期。独立样板仍隔离，后端接口、角色权限与业务口径不在本轮修改范围。

以下为本轮正式页面的执行结果，使用独立于第 8 节样板的代码、测试响应与浏览器证据。Browser 插件缺席，使用项目已有 Playwright 和本机 Chrome，未安装新依赖。视口为 1440×1000、1024×900、390×844；生产发布不在本轮范围。

| 检查 | 结果 | 本轮范围 |
| --- | --- | --- |
| lint | 通过 | `npm.cmd run lint` |
| 单元／组件测试 | 85 项通过，11 个文件 | `npm.cmd test -- --maxWorkers=2`；包含正式及旧业务回归、presence 与 Chrome 交互测试 |
| 正式构建与样板隔离 | 通过 | `npm.cmd run build`；既有 ChinaMap3D 623.31 kB chunk 警告保留；dist 不含 ui-spec.html、SpecApp、hy-spec、visual-qa 或测试客户字串 |
| 浏览器场景检查 | 56 项通过 | 覆盖工作台、经营概览、客户与详情抽屉、嵌套确认、详情接续编辑、dirty、研究原生 dialog、AI／导入、移动导航及加盟领取 |
| 桌面／平板／手机布局 | 通过（所测范围） | 三种视口；卡片、正文、抽屉及主要操作可见，桌面正文 14／22 px、手机 16／24 px |
| 浮层与键盘 | 通过（所测路径） | 保存关闭保留内容、busy／dirty、快速开关、嵌套顺序、Tab／Shift+Tab、Escape、退出期间 inert／滚动锁及焦点返回 |
| 动效与静态层次 | 通过（所测路径） | 卡片命中框固定、入场不随数据更新重播、记录 ID 去重、完整进退场；截图和录屏见下 |
| 降级 | 通过（所测模式） | 降低动态及运行中实时切换、forced-colors、降低透明度、`@supports` 模拟不支持 backdrop-filter 的实色回退 |
| 合成背景文字对比度 | 6 个采样通过 | 实际合成背景采样结果为 4.71～8.15:1；只覆盖采样的文字与背景组合，不代表全站所有状态或全部非文字控件 |
| 控制台与页面错误 | 通过 | 最终 56 项浏览器检查记录 pageerror 0、console error 0 |
| 本地视觉预览隔离 | 已验证 | `npm.cmd run preview:visual` 在 127.0.0.1:4176 提供正式构建与测试响应；脚本不读取 .env，CSP 为 connect-src 'self'，测试数据不进入正式包 |
| 真实手机、Safari、Firefox、人工读屏 | 未执行 | 浏览器尺寸模拟不作为物理设备验收 |
| 生产发布 | 不在本轮范围 | 本地代码、构建和预览交付 |

首次并行检查出现两条旧测试的超时／即时关闭断言失败。旧 Legacy 测试仅调整为等待实际退场完成，没有移除业务断言；App 测试未修改。最终使用 2 个 worker 全量运行 85 项通过。此记录保留初次失败及处理范围，不将单项重跑代替最终全量结果。

本轮证据目录：
`C:/Users/Administrator/.codex/visualizations/2026/11/06/01a1afd9-4723-75e1-97fe-c6327cbeb749/`

| 证据 | 文件 |
| --- | --- |
| 桌面首页前后对比 | before-desktop-home.png、after-desktop-home.png |
| 桌面抽屉与经营概览前后对比 | before-desktop-drawer.png、after-desktop-drawer.png、before-desktop-overview.png、after-desktop-overview.png |
| 手机、平板与浮层 | after-mobile-home.png、after-mobile-navigation.png、after-mobile-drawer.png、after-tablet-home.png、after-native-dialog.png |
| 强制颜色 | after-forced-colors.png |
| 最终检查与对比度 | browser-qa.json、contrast-results.json |
| 动效录屏 | glass-motion-demo.mp4、glass-interactions.webm |
| 可复现检查脚本 | haoyi-glass-capture.cjs、haoyi-glass-qa.cjs、haoyi-glass-contrast.cjs、haoyi-glass-demo.cjs |

上述证据使用测试响应验证正式前端；不构成线上真实接口、OIDC、真实客户写入或物理设备验收。`browser-qa-partial.json` 为中途记录，最终结果以 `browser-qa.json` 为准。

## 10. 按用途区分居中弹窗与抽屉（2026-11-06）

本轮将普通新增／编辑和 AI 助手调整为居中弹窗，线索连续详情保留侧边抽屉；沿用前述玻璃材质与模态生命周期。

| 检查 | 结果 | 本轮证据 |
| --- | --- | --- |
| 测试、lint、类型检查、正式构建 | 通过 | 85／85 项测试通过；lint、tsc、正式 build 均通过 |
| 普通新增弹窗：桌面 | 通过 | 1280×720 视口，宽 720 px，位置 x=280、y=16 |
| 普通新增弹窗：手机 | 通过 | 390×844 视口，宽 358 px、高 812 px，位置 x=16、y=16；无横向溢出 |
| 编辑弹窗滚动与焦点 | 通过 | 标题固定，内容内部滚动，保存操作可达；关闭后焦点返回新增按钮 |
| AI 工作弹窗 | 通过 | 1440×1000 视口，居中 880×553 px，位置 x=280、y=223.5 |
| 线索连续详情 | 通过 | 1440 px 宽视口中抽屉宽 560 px，贴右侧，保留连续详情布局 |

截图位于第 9 节同一证据目录：`centered-editor-mobile.jpg`、`centered-ai-desktop.jpg`。以上为本轮实际浏览器检查结果，保留此前验收记录及其适用范围。

## 11. 新拟态组件展厅与能源配色（2026-11-09）

按用户明确要求实现第一阶段独立组件展厅；后续增加蓝／青／能源绿配色及丰富动效，并根据用户反馈重做表单布局。仅本地 fixture，未迁移正式业务页面、接入真实图片服务或发布生产。详见 [component-showroom.md](component-showroom.md)。

| 检查 | 最终结果 |
| --- | --- |
| 组件与应用回归 | 16 文件、126 项通过；`npm.cmd test -- --maxWorkers=2` |
| ESLint | `npm.cmd run lint` 通过 |
| 独立构建 | `npm.cmd run build:ui-spec` 通过 |
| 普通业务构建 | `npm.cmd run build` 通过；保留原 ChinaMap3D 大 chunk 警告 |
| 构建隔离 | dist 无 ui-spec.html、样例图片、neo-showroom、Press Jelly 或表单示例标记 |
| 响应式 | 8 分类 × 390／768／1440／1920，共 32 项无整页横向滚动；0 pageerror、0 API 请求、0 损坏图片 |
| 关键交互 | 长按取消／单次提交、Fan 触屏两步与重播、Sheet 吸附／正文滚动／焦点恢复、表单首错／失败重试、dirty 保存保护、附件预览／移除、图表快速更新／重播数据一致性通过 |
| 表单补充 | 同批次重复 requestSubmit 仅产生一个保存任务；保存中 17 个主表单控件禁用；移动输入 16 px；768 优先级标签保持单行 |
| 降低动态／强制颜色 | 检查所测组件路径；系统偏好变更后取消动画，保留原生选择、可见边界和焦点；外部命中框不跟随 Press Jelly 缩放 |
| Hallmark | 9 个新增非测试源文件：0 FAIL、0 未处理 REFLEX；2 个有理由的弹簧豁免、1 个本地提交模拟说明；3 个设计提示记录于展厅规范 |
| Hallmark render | 因未安装 puppeteer-core 未运行；实际渲染使用项目 Playwright／本机 Edge 单独检查 |

本轮证据目录：`C:/Users/Administrator/.codex/visualizations/2026/11/09/01a1bdf5-7afd-73f2-9f99-0adcffb4c4d0/`。

- 最终响应式报告：`final-showroom-qa.json`。
- 卡片桌面／手机：`final-showroom-desktop.png`、`final-showroom-mobile.png`。
- 表单桌面／手机：`final-forms-desktop.png`、`final-forms-mobile.png`。
- 静态审查：`hallmark-showroom-final.json`。
- 手势、表单、图表、强制颜色与重播过程另有对应截图。

文字／图形对比度采样用于修正深色指标标签及临界蓝色文字；不把这些采样扩张为全站全部状态的 WCAG 认证。真实设备、Safari、Firefox、人工读屏与生产环境未在此验收。


## 12. 组件展厅视觉更新复核（2026-11-09）

按已批准的“Uiverse 柔软材质＋SaaSFrame 表单排版”方案，更新共享阴影、圆角、48 px 控件、16 px 输入、1120 px 表单宽度及 180／240／400 ms 反馈节奏。仅修改展厅 CSS 和设计说明；字段、事件、数据和正式业务页面保持。外部案例只参考视觉风格。

| 检查 | 本轮结果 |
| --- | --- |
| 回归测试 | 16 文件、126 项通过，包含长按取消／单次确认、触屏 Fan、Sheet 档位与焦点、表单校验／提交锁、图表快速更新和骨架生命周期 |
| lint 与两种构建 | 全部通过；正式构建保留此前 ChinaMap3D chunk 大小提示 |
| 构建隔离 | 正常 dist 无展厅入口、样例图片、neo-showroom、Press Jelly、客户资料演示表单 |
| 浏览器布局 | 应用内浏览器 8 分类 × 390／768／1440／1920 共 32 项，标题对应正确、无整页横向溢出、无 Vite 错误层或损坏图片；控制台无 error／warn |
| 表单 | 实测 16 px 输入、48 px 高、18 px 分组标题；手机原生 Select；首错聚焦，配色／动效切换保留填写内容；保存失败保留草稿，重试与正常保存成功 |
| 手势／浮层 | 350 ms 长按取消、1400 ms 长按完成；图片预览关闭返回原卡片；Sheet 40／72／94% 档位、正文独立滚动和关闭焦点恢复通过 |
| 动态及颜色降级 | 浏览器实测关闭动态后输入过渡为 0s；减少动态与强制颜色规则和既有组件回归检查保留。本轮浏览器接口不支持媒体模式模拟，因此未重新宣称这两种模式的渲染验收；此前证据见第 11 节 |
| 对比度采样 | 7 组普通文字／品牌按钮／深蓝指标／输入边界／错误提示采样均达到对应阈值；最低文字样本 4.51:1，输入边界 3.06:1，不等同于全站认证 |
| Hallmark | 9 文件 0 FAIL、0 未处理 REFLEX；4 WARN 均有设计理由，2 弹簧豁免、1 本地提交说明；独立截图复核结果 ship |
| Hallmark render | 已调用，因缺少 puppeteer-core 未运行；实际浏览器结果独立记录，不混称原生 render 通过 |

证据沿用第 11 节目录：`restyle-browser-qa.json`、`restyle-contrast.json`、`hallmark-restyle-final.json`；截图为 `restyle-forms-desktop.jpg`、`restyle-forms-mobile.jpg`、`restyle-cards-desktop.jpg`。

默认入口仍为本地组件展厅；交付时打开 `?section=forms`，彩色／丰富模式。未发布生产。

## 13. shadcn/ui 参考组件与统计动效（2026-11-09）

按用户进一步要求读取 shadcn/ui 官方 Card、Field、Input Group、Chart 及交互面积／柱状图源代码。参考其组合方式、排版与语义配色，以展厅现有 CSS 适配；仅新增 Recharts 3.10.1，未整库初始化或引入外部业务模块。输入凹陷和内容面板阴影进一步减轻。

| 检查 | 本轮结果 |
| --- | --- |
| 测试 | 17 文件、131 项通过；新增 5 项覆盖 7／3 日、面积／柱状、键盘 Tooltip、快速数据更新、重播、超过目标和动态取消 |
| lint／构建 | lint、build:ui-spec、正常 build 均通过；独立展厅约 805 kB JS（gzip 234 kB）触发 chunk 提示，正式包原 ChinaMap3D 提示保留 |
| 业务隔离 | 正常 dist 无 ui-spec.html、样例图片、neo-showroom、neo-analytics、Recharts 容器标记；正式主 JS／CSS 产物哈希与此前保持一致 |
| 响应式 | 应用内浏览器 8 类 × 390／768／1440／1920 共 32 项无整页横向溢出、损坏图片或 Vite 错误层；新图表均测得非零宽高 |
| 交互 | 原生范围选择、面积／柱状切换、方向键数据提示、趋势明细表与全局数据切换一致；第一组末三日合计 93，第二组 104 |
| 动态 | 丰富／轻柔／关闭分别为 900 ms／240 ms／静态；关闭后浏览器两图 data-motion=off，切换数据立即显示最终值并保留 3 日选择 |
| 手机图表 | 390 px 视口中趋势绘图区宽 309 px、径向图宽 300 px；无图表内部溢出，键盘提示第 2 日 18 条可见 |
| Hallmark | 11 个非测试源文件：0 FAIL、0 未处理 REFLEX；6 WARN（4 个原有设计提示、2 个 CardTitle 实际渲染 h3 的分析误报）；2 弹簧豁免、1 本地提交说明；独立复核 ship |
| Hallmark render | 因缺少 puppeteer-core 未运行，真实渲染使用应用内浏览器独立检查 |

证据仍位于第 11 节目录：`shadcn-browser-qa.json`、`hallmark-shadcn-final.json`；桌面图表 `shadcn-charts-desktop.jpg`，手机完整趋势与键盘提示 `shadcn-charts-mobile-detail.jpg`，表单 `shadcn-forms-desktop.jpg`。官方源代码参考存于 `shadcn-reference-code.json`。

此轮未重新模拟系统减少动态／强制颜色媒体模式，沿用组件偏好测试与样式降级规则；不构成真实设备或人工读屏验收。未接入真实数据、迁移业务页面或发布生产。交付打开 `?section=charts`，彩色／丰富模式。

## 14. 五类组件统一与动效升级（2026-11-09）

仅修改独立展厅。按钮、卡片、表单、导航和弹层参考 shadcn 官方组件结构并适配已有 token；无新增依赖，无正式业务页面修改。

| 检查 | 本轮结果 |
| --- | --- |
| 回归 | 17 文件、137 项通过，新增复合输入标签／键盘、嵌套 fieldset 提交禁用、弹窗退出锁定／焦点／dirty／busy、Popover 关闭路径 |
| lint／构建 | lint、展厅构建、正常业务构建通过；展厅约 813 kB JS 与原业务 ChinaMap3D 的 chunk 提示保留 |
| 隔离 | 正常 dist 无展厅入口、示例图片、neo-showroom／neo-overlay-dialog／neo-nav-indicator／Recharts 标记；业务主包哈希不变 |
| 布局 | 八类 × 390／768／1440／1920 共 32 项无整页横向溢出、损坏图片或 Vite 错误层；所有尺寸表单输入 16 px |
| 表单 | 浏览器验证首错聚焦；配色／动效切换保留输入；模拟失败保留草稿，关闭失败开关后保存成功，提交过程字段禁用 |
| 卡片／导航 | 卡片选择和完成状态可操作；Tabs 筛选即时更新；快速侧栏切换起点修正为当前绘制位置；同排卡片 footer 基线对齐 |
| 弹层 | 编辑→未保存提醒→继续编辑→保存退场，最终焦点回到“表单弹窗”，body 滚动锁解除；Popover Escape 关闭；手机 Sheet 72% 档位、直接选择及独立正文滚动可用 |
| 手机 | 表单单列／原生 Select；导航 Tabs 和局部横向表格完整；Sheet 底栏换行且无横向溢出，复选框与文字同行 |
| Hallmark | 13 文件，0 FAIL／0 未处理 REFLEX；6 WARN 沿用第 13 节已有理由，2 弹簧豁免、1 本地提交说明；独立复核提出的导航快速切换与卡片基线两项均已修正 |
| 媒体模式与 render 限制 | 组件测试及 CSS 保留减少动态／强制颜色降级；本轮浏览器不支持媒体模式模拟。Hallmark render 缺少 puppeteer-core 未运行，截图检查由应用内浏览器完成 |

证据在第 11 节目录：`controls-browser-qa.json`、`hallmark-controls-final.json`；截图 `controls-buttons-desktop.jpg`、`controls-cards-desktop.jpg`、`controls-forms-desktop.jpg`、`controls-forms-mobile.jpg`、`controls-navigation-mobile.jpg`、`controls-dialog-desktop.jpg`、`controls-sheet-mobile.jpg`。

交付预览为彩色／丰富模式。仅本地示例，未发布生产；真实设备和人工读屏未验收。

## 15. 正式业务 v1.2 柔软新拟态迁移（2026-11-09）

用户确认展厅后授权迁移。本轮修改正式共享 tokens、theme-light、motion、交互 hook 和 Chrome；同步对话框与抽屉的进入时长。保留业务组件树、字段、流程、API、认证、角色权限与统计口径。根目录新增 `design.md`，MASTER、组件规范、页面规范和 AGENTS 同步 v1.2。

覆盖工作台、行业情报、企业动态、研究与报告、统一待办、客户线索／跟进／商机／批次、公开池与领取后拓展、加盟／合作／合同／培训／沟通、经营概览／报告／知识／通知、设置与账号。保留原生选择、输入与查询行为；图表沿用原数据，经营漏斗统一蓝、青、深蓝、浅绿并修正白字黄底对比不足。

| 检查 | 本轮结果 |
| --- | --- |
| 回归测试 | 17 文件、143 项通过；新增按钮视觉层取消／禁用／键盘／偏好、导航连续快切、一次反馈检查，原权限和业务测试保持通过 |
| lint 与构建 | lint、业务 build、build:ui-spec 均通过；原有业务 ChinaMap3D 与独立展厅的大 chunk 提示保留 |
| 隔离 | 正式 dist 的 10 个 JS/CSS 产物无展厅、Recharts 容器、visual-fixtures 或示例身份标识，无 ui-spec.html；本地 fixture 只由回环预览服务器返回 |
| 响应式 | 应用内浏览器 28 路由 × 390／768／1440／1920 共 112 项：无整页横向溢出、主要面板越界、损坏图片，控制台无 error／warn |
| 表单／浮层 | 新建待办空提交显示原生必填提示并聚焦；实测输入 16px／48px；模拟保存时按钮禁用、成功后 Toast、弹窗退场完成、焦点回新建按钮、滚动锁解除 |
| 导航／详情 | 手机导航键盘进入、Escape 退出及焦点返回；客户详情关闭回到原记录。手机五项首页指标均可见。最后一次截图在尺寸切换稳定后重拍 |
| 图形／颜色 | 经营漏斗实际计算色与正式 token 一致；8 组文字、输入边界与图表文本采样达到阈值，普通文字最低 5.27:1、控件边界 3.12:1。采样不构成全站 WCAG 认证 |
| Hallmark | 3 个正式共享 CSS：0 FAIL、0 未处理 REFLEX；6 条有记录豁免为边框补偿尺寸与 token 文件无 active 状态，2 条统一面板理由、1 条报告引用边线说明；独立代码及四张截图复核 ship |
| 媒体与 render 限制 | 减少动态／强制颜色的组件测试与 CSS 降级规则通过；本轮浏览器接口不支持媒体模式模拟。Hallmark render 因缺少 puppeteer-core 未运行，实际渲染由应用内浏览器独立检查 |

交付预览 `http://127.0.0.1:4176/` 使用正式构建和合成本地响应，固定总部管理身份。fixture 不读请求体、写入不持久化、响应固定 200；不把模拟保存视为生产存储验收。CEO／加盟商权限拒绝、会话过期、真实业务写入、导出文件与真实设备／人工读屏未做本轮浏览器验收。未发布生产。

证据目录沿用第 11 节：`business-browser-qa.json`、`business-static-checks.json`、`hallmark-business-final.json`；截图 `business-home-desktop.jpg`、`business-home-mobile.jpg`、`business-form-desktop.jpg`、`business-form-mobile.jpg`、`business-overview-desktop.jpg`。

## 16. 对齐修复与正式列表分页（2026-11-09）

依据用户两张截图，首页五指标改为同排、同标签和数字基线；窄屏两列、首项通栏。研究记录使用实白阅读面，筛选分段与状态选择均为 48px，记录标题、元数据、状态和关注动作分列，手机自然分行。分页使用共享组件，完整数组在筛选／排序后切页，已有服务端分页保留原协议；没有总数的游标接口不虚构总数。实际覆盖范围见 pages.md 第 6 节。

| 检查 | 本轮结果 |
| --- | --- |
| 回归测试 | 19 文件、160 项通过；包含已知／未知总数、空集、页容量、过滤复位、末页删除、详情跨页返回、游标过期响应、请求失败重试和重复游标终止 |
| 合并待办 | 修复下一批到期日提前导致重排跳项：完整读取内部待办游标后与业务事项统一排序、分页；异常来源明确显示错误且不宣称完整总数。新增乱序批次测试通过 |
| 企业动态 | 翻页失败不再显示旧页记录并标新页号；失败重试回归通过 |
| 构建 | lint、业务 build、独立 build:ui-spec 通过；最后一处页码颜色修正后业务构建再次通过。原有 ChinaMap3D／独立展厅大 chunk 提示仍在 |
| 产物隔离 | 正式 10 个 JS/CSS 产物无展厅入口、Recharts 容器、visual-fixtures、示例身份或示例图片标记 |
| 响应式 | 28 路由 × 390／768／1440／1920 共 112 项，无整页横向溢出、分页栏／研究面板／首页指标区越界、损坏图片或框架错误层，浏览器控制台无 error／warn |
| 对齐实测 | 1440px 首页五项标签 y=390、数值 y=420、单项高 144px；研究筛选分段与 Select 同 top=682、高 48px；390px 五指标均可见 |
| 交互实测 | 客户25条按10／10／5分页，搜索南京回第1页共5条；研究20／5分页、改10回第1页、持续关注复位；合并待办27条尾页7条，来源筛选内部25条回首页；合作机构25条尾页5条，Enter键上一页正确 |
| 手机与选中态 | 手机保留上一页／当前页／下一页及原生页容量选择，按钮至少44px；修复旧CRM规则覆盖当前页字色，实际白字配品牌蓝，与桌面一致 |
| Hallmark与独立复核 | 3共享CSS：0 FAIL／0 WARN，6既有尺寸或token豁免、2面板理由、1报告引用边线说明；截图复核提出页码字色问题已修正并重拍 |
| 验证边界 | 浏览器接口未提供减少动态／强制颜色模拟，保留组件测试与CSS降级；Hallmark render仍因缺少puppeteer-core未运行，渲染证据来自应用内浏览器。合并待办全量读取的超大数据集耗时及真实业务接口尚未做性能验收 |

本地预览仍为正式构建 + 合成响应。预览 fixture 扩展为25条以上并实现真实分页／筛选，不持久化业务修改，不连接生产身份或数据。未发布生产。

证据沿用第11节目录：`pagination-browser-qa.json`、`pagination-static-checks.json`、`hallmark-pagination-final.txt`。截图：`pagination-home-desktop.jpg`、`pagination-home-mobile.jpg`、`pagination-research-desktop.jpg`、`pagination-research-mobile.jpg`、`pagination-research-footer-mobile.jpg`、`pagination-leads-desktop.jpg`、`pagination-leads-mobile.jpg`。

## 17. 正式侧栏二级折叠菜单（2026-11-09）

工作台保持一级直接入口，工作空间、客户拓展、业务协作、经营管理变为可折叠组，首页默认收起、最多展开一组。原有权限过滤、目的地路由及页面内 Tabs 保留。宽屏224px，平板768–1279px使用200px文字侧栏；手机继续使用模态导航抽屉。平板首页内容同步单列，避免文字侧栏挤压双栏阅读区。

| 检查 | 本轮结果 |
| --- | --- |
| 回归 | 20文件、167项通过；新增二级菜单、键盘Enter／Space、Tab跳过收起项、详情和前进后退、别名工作区当前态、叶子点击与加盟商权限用例；CEO用例按实际折叠路径验证 |
| 构建 | lint、正式build、独立build:ui-spec通过；按钮按下反馈与缩进小修后正式build再次通过，保留既有大chunk提示 |
| 实际交互 | 桌面展开客户拓展→客户线索，当前项和父组正确；切经营管理自动关闭客户组；Space收起。手机点击客户线索后退场、滚动锁解除且焦点回打开导航，重新打开后定位客户组；Escape关闭后焦点再次恢复 |
| 尺寸与页面 | 28路由×390／768／1440／1920共112项无整页横向溢出、侧栏内部横向溢出或框架错误层；控制台无error／warn。1440px组按钮和工作台48px，子项44px；768px侧栏200px、首页正文单列 |
| Hallmark | 两个修改的正式共享CSS：0 FAIL／0 WARN／0未处理REFLEX；5条既有边框尺寸豁免及1条动效文件由主题文件提供active状态的分层理由，2条统一面板说明、1条引用边线说明 |
| 边界 | 本地正式构建与合成数据验收，未发布生产。减少动态与强制颜色保留CSS降级，本轮未用浏览器模拟系统媒体偏好；Hallmark render缺少puppeteer-core，实际截图由应用内浏览器完成 |

同步 `design.md`、MASTER、components、pages。证据沿用第11节目录：`navigation-browser-qa.json`、`hallmark-navigation-final.txt`；截图 `navigation-desktop.jpg`、`navigation-mobile.jpg`、`navigation-tablet.jpg`。

## 18. 加盟商中心走查修复（2026-11-09）

修复列表与详情之间的无效留白、表单占位标签与复选框错行、状态代码直出、提交无锁、失败无反馈、旧错误覆盖成功、未保存内容丢失与返回焦点丢失。正式页面实现提取至 `legacy/components/FranchisesView.tsx`，样式限定在加盟商页面；旧导出入口保留。后台授权和回访增加事务级重复请求保护，无数据库迁移。

| 检查 | 本轮结果 |
| --- | --- |
| 前端回归 | 21 文件、178 项通过；其中加盟档案 11 项覆盖保存锁、失败重试、草稿、中文状态、跨记录确认／反馈隔离、焦点恢复。使用 `npm.cmd test -- --maxWorkers=2`；首次高并发执行的 3 个既有样板用例超时，限制并发后全量通过，未放宽断言或超时时间 |
| 后端回归 | workbench、lifecycle、integration 共 24 项通过；包括重复授权、重复月度回访及 SQLite 两会话并发重试，后续回访／问题待办／审计只生成一次 |
| 构建 | lint、正式 build 通过；最后手机间距及危险操作颜色调整后再次构建通过，保留已有 ChinaMap3D 大 chunk 提示 |
| 响应式 | 1920／1440／768／390 四宽度的列表、详情、授权表单均无整页横向溢出；桌面详情 560px，手机全屏；居中表单桌面 720px，390px 时 358px，左右 16px；表单按钮 44／48px，复选框标签点击区 44px |
| 浏览器交互 | 模拟慢请求连点只发送 1 次；必填校验聚焦省份；409 失败保留省市输入；200 重试关闭表单、显示新授权、旧错误消失；500 回访失败可见并可重试；放弃／继续编辑及嵌套焦点恢复正确 |
| 分页与焦点 | 25 条合成档案首屏 10 条，第 10 条可连续查看第 11 条；关闭恢复原页与原打开按钮。单元测试覆盖原触发记录退出筛选后的搜索框焦点补偿 |
| 降级与控制台 | Chromium 实测 reduced-motion 和 forced-colors：内容完整、无位移变换、复选框可操作、无整页横向溢出；正常路径无页面运行异常，故障注入产生的 409／500 为预期 |

浏览器使用 Playwright 与已安装 Chrome（Browser plugin not available）；验证地址 `http://127.0.0.1:4176/crm/franchises`，为正式构建加本地合成响应。故障与成功保存通过浏览器路由模拟，后端持久化及并发另由临时 SQLite 测试验证，不构成生产接口、PostgreSQL 或真实移动设备验收。未部署。

证据目录：`C:\Users\Administrator\.codex\visualizations\2026\11\09\01a1bef8-50f4-77e1-a1be-76104594fa61`。浏览器结果 `franchise-fix-browser-qa.json`；截图 `franchise-fixed-list-1440.png`、`franchise-fixed-drawer-1440.png`、`franchise-fixed-drawer-390.png`、`franchise-fixed-form-390.png` 和 `franchise-fixed-forced-colors.png`。

## 19. 共享分页样式覆盖与窄容器补查（2026-11-09）

用户截图暴露出第16节验收遗漏：旧 CRM 的通用 label/button 选择器覆盖共享分页，使条数标签上下堆叠、48px 选择框与40px按钮错位；同类覆盖还让手机隐藏页码重新出现。原来的整页溢出检查未发现内部按钮重叠。修复限定在共享分页和紧邻分页的表格底边，保留原生选择、分页逻辑及业务数据。

| 检查 | 本轮结果 |
| --- | --- |
| 实测对齐 | 1920px 合作机构页：选择框与全部按钮 top=959px、高48px；标签保持横排。表格末行及包装层底边为0，分页顶边1px，去掉重复横线 |
| 页面矩阵 | 22个分页入口 × 1920／1440／768／390 共88项，无控件相交、分页容器越界或整页横向溢出；分页按钮及选择框均48px。其中企业动态4项用浏览器拦截提供新版 events 响应结构，其他84项使用现有合成预览接口 |
| 窄容器复核 | 320／360／640／768／1024px 的137／1024页、未知总数、七页按钮、省略号，以及实际容器640／641px两侧，共42个布局状态通过。768px有侧栏时容器仅470px，已正确切换为仅当前页；此项为真实构建页面临时DOM状态，不写API |
| 交互与降级 | 下一页显示11–20／25；切20条回1–20／25；Enter下一页显示21–25／25。Chrome模拟 forced-colors 与 reduced-motion，当前页保留系统选中色、transform为none，未溢出 |
| 自动检查 | Pagination与LegacyPage两文件15项通过；lint、TypeScript和完整业务构建通过，保留既有ChinaMap3D大chunk提示。构建使用独立输出目录，不覆盖正式dist |

使用 Playwright 与已安装 Chrome；本地合成预览地址为 `http://127.0.0.1:4180/crm/partners`。旧预览 fixture 尚无新版企业动态 events 响应，首次进入该页会因缺少 runs 数组失败；补验仅在浏览器提供合成结构，不能据此宣称真实接口已验收。未连接生产数据、未部署，不构成真实设备或其他浏览器验收。

证据沿用第18节目录：`pagination-alignment-qa.json`；截图 `pagination-alignment-before.png`、`pagination-alignment-after-desktop.png`、`pagination-alignment-after-bar.png`、`pagination-alignment-after-mobile.png`、`pagination-alignment-forced-colors.png`。构建产物独立放在该目录的 `pagination-preview/`。
