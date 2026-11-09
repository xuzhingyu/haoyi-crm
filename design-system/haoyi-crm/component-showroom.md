# 浩宜新能源组件展厅

2026-11-09。本地第一阶段交付，入口 `http://127.0.0.1:5174/ui-spec.html`，代码隔离在 `apps/franchise-portal/src/ui-spec/showroom/`。`?section=cards`、`?section=forms` 等保留当前分类；`?legacy=1` 保留原业务样板。

用户已确认本展厅风格并授权正式业务迁移。正式共享层现采用 v1.2，设计摘要见根目录 [design.md](../../design.md)，本地业务预览为 `http://127.0.0.1:4176/`。本展厅仍独立隔离；下方各轮交付记录中的“未迁移”描述属于当时状态。

## 材质与配色

按用户指定的新拟态方向，保留平面、凸起、内凹、悬浮四类表面。配色提供“柔雾／彩色”，默认彩色；切换配色不重置输入或组件状态。

彩色方案沿用 MASTER 的蓝色方向，增加青色、浅能源绿和深蓝指标板。这些是本地提案的扩展色，不宣称为经过企业 VI 核验的官方色板。主要输入、列表和长文本使用清晰的不透明底。

| 用途 | 彩色方案 |
| --- | --- |
| 主操作 | 蓝 `#2462E8`，深蓝文字 `#1D4ED8` |
| 操作与设置 | 青 `#0B7480`，浅青 `#D4EEEB` |
| 任务与能源强调 | 浅绿 `#E1EDCE`，重点进度 `#C4E98A` |
| 重点指标 | 深蓝 `#153E58`，白色数字、浅蓝说明 |
| 输入与阅读 | 白色面板、浅灰输入底、细边界与浅内凹 |

表单本轮视觉更新：客户与服务信息为白色主面板，跟进优先级、渠道、半径与提醒归入浅青设置面板；保存栏独立。密码、只读、禁用及错误状态在独立样例区展示。移动端单列输入，触控目标至少 44 px，文本输入 16 px。

桌面与手机输入均为 16/24 px、48 px 高；标签 14/20 px、分组标题 18/28 px。控件圆角 12 px、面板 20 px，表单最大宽度 1120 px；桌面内边距与分组间距 24 px，手机面板内边距 20 px。表单保留 1100／950／767 px 三个断点以及手机原生 Select。

阴影集中为凸起（双向 6 px 偏移、16 px 模糊）、内凹（双向 2 px 偏移、4 px 模糊）、浮层（0 16 px 40 px，16% 透明深蓝）三档。输入保留独立边界与即时焦点环；表格行不加阴影。颜色、阴影、控件和面板圆角统一从展厅 token 读取。

## 组件范围

| 分类 | 可操作示例 |
| --- | --- |
| 按钮 | 主／次／文字／危险／图标／加载；八状态；Press Jelly；Hold to Confirm |
| 卡片与资料 | 指标、任务、选择、折叠；图片／内容 Fan Stack；图片网格、灯箱、本地附件 |
| 表单 | 文本、邮箱、搜索、密码、备注、数量、金额、日期、Select、Checkbox、Radio、Switch、Segmented、Slider；校验、失败重试与只读禁用 |
| 导航与列表 | 分类导航、Tabs、面包屑、分页、步骤条、操作菜单、表格排序筛选选择和批量工具条 |
| 弹层 | 确认、表单、详情抽屉、Popover、Tooltip、Toast、Morph Sheet |
| 图表与数字 | 交互面积／柱状、径向目标、时间范围、键盘 Tooltip；Activity Rings、Odometer、条形、折线、环形占比、预算条、进度、数据切换／表格／重播 |
| 加载与反馈 | 四种骨架、加载进度、成功、失败、空结果、离线、无权限、重试和撤销 |
| 组合体验 | 本地客户资料、图片预览、编辑／dirty 保护、保存、长按归档和重置 |

## 动效与交互契约

- 丰富／轻柔／关闭三档；系统减少动态与强制颜色优先。偏好变更取消运行中的 WAAPI，立即呈现最终状态。
- 输入颜色反馈 180 ms、选择反馈 240 ms、成功图标 400 ms。输入和外部命中区域稳定，配色／动效切换保留填写内容。
- Press Jelly 仅压缩内部视觉层，外部命中区域不动。丰富模式增加一次点击扩散，忙碌时禁用。
- Hold 默认 1200 ms；松开、移出、取消、失焦及页面隐藏中断。Space 可长按；Enter／普通确认入口提供替代。提交加即时锁，防止同批次重复调用。
- Fan Stack 支持 2–7 项，悬停／焦点展开，触屏先展开再选择。丰富模式逐张弹性摊开，选中抬升；重播清除选择，不调用业务动作。
- Morph Sheet 三档 40%／72%／94%，仅拖柄负责拖动，正文独立滚动；提供按钮和方向键。原生 dialog 关闭后恢复触发点焦点。
- 表格 FLIP 只处理排序／筛选／分页后的位置；数据立即更新。丰富 420 ms、最多 72 ms 错峰，轻柔 160 ms。
- 图表重播只改变绘制，不生成中间业务数据；数字朗读、数据表、进度 ARIA 始终为传入值。丰富 1050 ms，轻柔 300 ms；离屏／隐藏暂停。
- Skeleton 在模拟请求超过 300 ms 后出现，1400 ms 扫光；完成、失败、离屏和隐藏停止或暂停。成功反馈为一次勾选绘制与柔弹。
- 浮层沿用既有 focus／inert／退出管理；dirty／busy 行为不随视觉修改改变。

## 参考及采用范围

- [awesome-design-md](https://github.com/VoltAgent/awesome-design-md)：参考规范组织和层级分析，不是可直接导入的组件库。
- [Kinetik UI](https://kinetik-ui.dev/)：参考 Press Jelly、Hold、Fan、Sheet、Rings 等交互概念，使用 React DOM、CSS／WAAPI 和 Pointer Events 实现，无 React Native 依赖。
- [Motion 手势](https://motion.dev/docs/react-gestures)与[布局动画](https://motion.dev/docs/react-layout-animations)：参考手势状态与 FLIP 思路，未增加 Motion 依赖。
- [Uiverse 新拟态组件](https://uiverse.io/ui/neumorphism-ui)：参考控件的柔软凸起、内凹与按压质感，使用项目已有组件实现。
- [SaaSFrame 新增／编辑界面](https://www.saasframe.io/categories/create-element)：参考字号、留白、分组和主次关系；不引入参考产品的业务模块、字段或流程。
- [shadcn/ui Chart](https://ui.shadcn.com/docs/components/base/chart)、[Card](https://ui.shadcn.com/docs/components/base/card)、[Field](https://ui.shadcn.com/docs/components/base/field) 与 [Input Group](https://ui.shadcn.com/docs/components/base/input-group)：通过官方 CLI 读取组件代码，参考组合结构、语义配色、固定图表容器、自定义 Tooltip 和输入附加区域。统计展示使用 Recharts 3.10.1，与已有展厅 CSS 和本地 fixture 适配；未整库初始化或覆盖正式样式。参考记录和许可见 `showroom/shadcn-NOTICE.md`。

外部案例只借鉴视觉风格与组件实现方式。现有客户资料、服务信息、跟进设置、保存栏、状态样例和全部交互保持；不从行业案例扩展维修或工单功能。

外部作品仅用于审阅与分析，不将其整张页面图或品牌标志打入应用。附件演示中的两张 CC0 图片具有独立来源记录，见 `showroom/assets/credits.json`。

## 隔离与验证

全部数字、客户与提交结果均为本地 fixture；图片选择仅生成临时 Blob URL，移除及卸载时释放，不上传服务器。展厅不调用业务 API、OIDC 或真实客户数据。普通应用构建不包含展厅入口或样例图片。

验证使用项目 Vitest、ESLint、Vite 与 Playwright/本机 Edge。Hallmark 静态审查无 FAIL／未处理 REFLEX；允许的弹簧曲线及本地模拟提交在 CSS 留下理由。本轮保留四个有理由的设计提示：等宽单选项便于并列选择；图片轻微悬停缩放属于用户要求的丰富动效；输入共用容器规则保证状态与尺寸一致；Morph Sheet 的边界和柔影分别保证可辨识性与浮层层级。Hallmark 原生 render 因未安装 puppeteer-core 未运行，本轮渲染由应用内浏览器单独验收，不能混称其 render 已通过。

真实设备、Safari、Firefox、人工读屏及生产发布不在本次本地交付中。具体执行结果见 acceptance.md。


## shadcn/ui 参考细化

按用户进一步提出的高级质感与动效要求，白色阅读面采用低强度单侧投影，输入内凹收为 `inset 0 1px 2px rgb(32 54 74 / 7%)`，跟进设置采用浅青与白色混合底。双向凸起保留给按钮、选中控件和材质演示；不将所有内容面板堆叠重阴影。服务信息使用 16/24 px 次级标题，客户资料和跟进设置仍为 18/28 px。

统计区参考官方交互图表示例：面积／柱状图、径向目标进度、数据提示和时间范围选择均采用传入的本地示例数据；不引入外部产品的业务功能。现有 Activity Rings、Odometer、占比、预算及数据表继续保留。图形重播只改变绘制，数据、单位及可访问文本仍为最终值。

新统计组件丰富模式绘制 900 ms、轻柔模式 240 ms、关闭模式直接显示最终图形；离屏、页面隐藏与动效偏好变化会取消运行中的插值。7 日／3 日范围和面积／柱状均使用原生选择控件，方向键可读数据提示，趋势表提供等价明细。培训超过目标时显示实际百分比与超额记录，不截断数字。

图表容器按实际可用宽度测量，兼容 Recharts 3 的零尺寸内部包装层；不能对其 `.recharts-wrapper` 施加依赖父宽度的 `max-width: 100%`。图表代码仅由展厅入口引用，正常业务包不包含 Recharts。新增依赖与参考许可记录在 package-lock.json 和 `shadcn-NOTICE.md`。

本轮 Hallmark 新增两条 CardTitle 标题提示均为静态分析误报：组件实际渲染带 ID 的 h3，浏览器可访问树已核对。原有四条设计提示及其理由保留。

## 按钮、卡片、表单、导航与弹层统一

后续按用户要求将 shadcn 的组合结构扩展至五类组件，保留已有业务字段、流程和本地 fixture，不新增依赖。Button 使用明确的主／次／文字／危险／切换状态；蓝色主操作保留柔软按压，增加一次性高光与图标反馈。卡片采用 header／content／footer 分区，指标为深蓝、资料为白底、任务为少量浅绿；同排卡片操作栏统一 68 px 最小高度。

表单由两个独立面板整理为一张主卡：白色字段区、浅青设置区、底部保存栏。原 Field 继续拥有 ID／ARIA；金额和密码复合输入采用输入优先的 DOM 顺序、独立 addon，移动 Select 仍为原生控件。保存过程禁用整个 fieldset，成功、错误和选择反馈不移动输入命中框。

侧栏选中底板在稳定的按钮区域内滑动，丰富 360 ms、轻柔 160 ms。快速连续切换从当前绘制位置继续，尺寸变化直接重排；系统减少动态、关闭、隐藏或卸载时取消动画。列表使用 Tabs、稳定表格面与步骤进度线，筛选／选择／排序仍使用原有操作。

展厅新增 ShowroomDialog／ShowroomPopover，只在 ui-spec 中使用。Dialog 复用既有 Presence/useOverlay：进入 320 ms（抽屉 360 ms）、退出 180 ms，轻柔 160／100 ms，关闭即静态；退出后才释放滚动锁、inert 和焦点约束。保留 dirty／busy 保护，取消按钮走同一关闭入口。Popover 支持碰撞定位、Escape、外部点击与焦点恢复。Morph Sheet 增加 40／72／94% 直接选择，拖柄与正文滚动仍独立。

官方 CLI 代码参考见本轮证据 `shadcn-controls-reference.json`；当前验收见 acceptance.md 第 14 节。
