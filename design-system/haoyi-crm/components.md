# 浩宜 CRM 组件规范 v1.2

视觉值遵循 [MASTER.md](MASTER.md)。本文件同时区分**统一设计要求**、**正式页面的动效生命周期**与**当前样板的组件接口**；验收状态见 acceptance.md。样板基础组件定义位于 `apps/franchise-portal/src/ui-spec/components.tsx`，选择控件位于同目录 `controls.tsx`，不作为正式业务入口导入。

## 1. 按钮与操作

| 类型 | 场景 | 规则 |
| --- | --- | --- |
| `primary` | 当前区域最重要的提交／创建／领取 | 蓝底白字；同一操作区只保留一个 |
| `secondary` | 筛选、取消、查看、次要操作 | 浅色内容底与明确边框，默认类型；不能透出干扰文字的复杂背景 |
| `quiet` | 行内动作、更多、图标按钮 | 低视觉权重，保持明确 hover 和 focus |
| `danger` | 作废、删除、放弃等危险确认 | 危险色；必要时先展示对象、后果与原因 |

正式页面标准操作高 48 px，表内紧凑操作保持至少 44 px 点击区域；历史样板尺寸接口单独保留。手机交互目标至少 44×44 px，不因图标只有 16 px 而缩小点击区域。按钮内容左右内边距 12–16 px，图标与文字间距 8 px。

按钮文案使用具体动作，常见字数 2–6 字：新增线索、记录跟进、领取、保存、重试。图标不是每个按钮的必备项。禁止同一动作同时用图标按钮和文字按钮重复出现。

纯图标按钮新调用必须显式设置 `iconOnly`，宽高形成同尺寸方形，按钮圆角 12 px。必须有 `aria-label`，loading 时仍保留可访问名称和原点击区域；旧调用的自动识别仅作兼容，新代码不依赖该推断，不能仅凭 Tooltip 命名。

`loading` 显示忙碌状态并阻止重复点击，按钮区域保持稳定；异步动作结束才更新反馈。因当前数据状态暂不可用的动作可 disabled，并在必要时说明原因；没有授权且没有认知价值的动作隐藏。Tooltip 不能作为唯一的权限／禁用原因入口。

## 2. 列表与表格

- 默认使用真实语义 `table`，保留可访问 caption 与表头。文本左对齐、金额和数量右对齐，日期位置一致，操作列置于右侧。
- 表体与数据卡保持不透明白底；浅灰蓝或实白柔影可用于独立工具条／批量操作层，不作用于每个数据行。表头、选中行和 hover 状态不能因透出背景而降低辨识度。
- 标准行高 48 px，紧凑 40 px；多行内容可增高。名称最多常显两行，标识符可按语义截断但完整内容有可访问入口；手机号／订单号不能以换位或删位方式缩写。
- 表头与数据保持一致；可排序列有方向和 `aria-sort`，不支持排序的列不显示排序图标。服务端分页时排序必须作用于服务端结果，不能只排序当前页后假装全量。
- 关键列通过 `DataColumn.width` 分配稳定宽度；表头、金额、负责人、地区和日期避免逐字碎行，长客户名称允许自然换行。可用宽度不足时让表格容器局部滚动，不压缩字体或制造整页横向滚动；滚动区域保留可访问名称与键盘入口。
- 列表工具条顺序为搜索、常用筛选、更多筛选、视图／密度；主创建动作放页面标题区。批量条只在选中后出现，明确数量与范围。
- 复选框全选默认仅针对传入的当前列表。组件可保留外部已选 ID，但调用方不得未经说明将其当作“全部查询结果已选”。跨页批量能力需另行设计并由服务端支持。
- 结果少或为零时不渲染空白大表。首次空记录、筛选无结果、请求错误、无权限分别使用对应状态组件。
- 桌面操作列保留查看与一个高频动作，更多操作进入菜单。行内点击目标互相独立；只读值不可表现为可编辑输入框。
- 移动优先为信息卡，名称、状态、关键值和主动作固定位置；需要横向比较的表保留局部滚动。不要把所有列缩到 12 px 字体。
- 页码模式显示总量、页码、每页条数；游标模式显示上一批／下一批，不虚构总页数。当前样板分页由页面层管理，DataTable 不内置后端分页。

### 正式分页与筛选对齐（2026-11-09）

正式业务入口采用 `src/ui/Pagination.tsx`，与独立样板的 DataTable 分开维护。分页位于对应结果列表之后，以分割线和留白区分结果、条数选择与翻页操作，不增加第二层卡片。

| 模式 | 展示 | 数据约束 |
| --- | --- | --- |
| 完整数组 | 当前记录范围、总条数、页码 | `useClientPagination` 只接收已完成筛选／排序的完整数组 |
| 服务端页码 | 当前记录范围、服务端总条数、页码 | 企业动态的 `total` 与当前筛选来自同一次响应 |
| 服务端游标 | 当前页、上一页、下一页 | 保留不透明游标，不推算总量、末页或未发现的页码 |

- 页容量提供原生 `select`，默认选项 `10 / 20 / 50`；完整数组默认 10 条，游标与企业动态默认 20 条。切换容量或筛选回第一页；已知总量的列表在记录减少时回到最后有效页，客户端分页不能在后续新增时恢复已经失效的旧页。
- 已知总量的桌面页码适当省略中间区间；手机隐藏非当前数字页码，只留当前页与前后按钮。总量摘要、条数选择、翻页在手机独立排布，不靠缩小字体塞进一行。
- 使用具名 `nav`、`aria-current="page"` 与动态摘要；每页条数有可见标签，当前页和按钮状态不能只靠颜色表达。按钮至少 44px，独立焦点轮廓，强制颜色保留系统色边界和选中态。
- `busy` 同时禁用前后按钮、数字页码和条数选择，并设置 `aria-busy`。页码由页面控制，不改变选中记录、权限、表单或危险确认行为。成功、失败、空记录属于结果区状态，不由分页猜测。
- `useCursorPagination` 按查询与页边界隔离响应；筛选、容量变化及卸载使旧请求结果失效。重试保留当前游标；重复游标不得生成新的页。
- 返回完整数组的详情“上一条／下一条”继续使用完整筛选结果，不能改成仅当前页；地图、看板和图表也不接收分页后的切片。混合待办的游标先完整读取再合并排序，避免新增批次重排造成跳项。
- 部分来源失败或“最近调用”等有限窗口，要保留明确的范围说明，不能把窗口记录数写成全部业务数量。分页规范不新增接口、跨页批量操作或统计口径。

首页同组五个指标使用统一标签行与数字基线；重点色只改变材质，不让首项跨行占据双倍高度。研究范围切换组外高 48px、内部按钮至少 44px，与 48px 状态选择器居中对齐；标签与控件之间 12px、组间 24px，手机分组换行并保留标签。

## 3. 字段与表单

字段标签始终可见，不用 placeholder 代替。必填使用一致标记，并由原生 `required` 或对应语义支持；单位放标签或输入后缀，金额保留精度和业务含义。

默认单字段高度 48 px，输入字号 16 px、标签 14 px、控件圆角 12 px；多行备注依据内容至少 3 行。输入内容区采用不透明浅色内凹底。短表单单列，桌面相关短字段可两列；不把宽备注塞进窄列。选择项少且同时需要比较时可用 Radio；单选列表使用统一 Select，视口 `<768 px` 时原生、其余宽度自绘；复杂搜索选择须另行明确支持，不用文本输入模拟隐藏选项。

错误紧邻字段，以明确动作写出，例如“请输入金额”“结束日期不能早于开始日期”。首次提交聚焦第一个错误；错误关联 `aria-invalid`、`aria-describedby`。提示与错误不能同时抢占相同说明位置。成功不为每个字段堆叠绿色勾选；只在必要时反馈保存成功。

业务输入允许值、最大长度和校验取自服务端契约，不能因 UI 改造放松规则。日期默认北京时间；联系信息、身份证明和私密备注按权限展示。

### Checkbox、Radio 与 Switch

- 保留真实 `input` 及其选中、禁用、焦点和表单语义；外观可定制，不能用只响应 click 的 div 代替。可见标签与控件构成完整点击区域，手机目标不低于 44×44 px。
- Checkbox 为独立多选，标记圆角 5 px；支持 checked／unchecked／mixed，当前列表全选使用 indeterminate 表达部分选中。mixed 不是第三种业务值。
- Radio 用于同组互斥选项，圆形标记，共享 name；键盘方向键按原生行为切换，组标题使用 fieldset／legend 或等效语义。
- Switch 用于立即生效的开关，保持 `input type="checkbox"` 并提供 switch 语义和可见开关状态；需要整体表单提交的偏好通常使用 Checkbox。切换失败应恢复真实值并说明，不因材质效果隐藏禁用或忙碌状态。
- 选择标记以清楚的填充、勾／点和文字表达状态；背景高光属于装饰。forced-colors 下保留系统色的边框、选中标记和焦点。

### Select 与字段关联

- 桌面使用具备 combobox／listbox 语义的触发器和弹出选项，触发器显示已选值或明确占位；支持键盘打开、方向移动、确认、Escape 关闭，关闭后焦点回到触发器。
- 弹出列表采用 92% 白／20 px blur 的浮层材质、20 px 圆角和三级阴影；高度受视口限制，必要时内部滚动。不能穿过模态层级落到对话框后面，也不能被滚动容器裁切。
- 仅视口 `<768 px` 时使用原生 select，保留同一个受控 value、name、required、disabled、错误和标签；原生菜单外观由平台负责，不用伪造玻璃菜单覆盖系统选择体验。`pointer: coarse` 只扩大选择控件触摸目标，不单独决定 Select 使用原生分支。
- `Field` 的函数 children 接收关联后的 id、required 和 ARIA 属性，复合选择控件通过该参数连接可见标签与错误。原生 input／select／textarea 直接子元素继续支持原有自动关联方式。
- 选项文本、当前值、disabled 不能仅以颜色区别。只读值与可操作选择器分开；无选项时明确显示不可用，不弹出空白菜单。

## 4. 对话框、抽屉与详情

| 容器 | 适用场景 | 尺寸 |
| --- | --- | --- |
| 确认对话框 | 危险确认、小型单次决策 | 默认 440 px，最大不超视口减 32 px |
| 通用居中对话框 | 新增、编辑、记录跟进、一般信息查看 | 720 px |
| 宽居中工作弹窗 | AI 助手 | 880 px |
| 常规抽屉 | 对照列表、连续处理记录的业务详情 | 560 px |
| 宽抽屉 | 上述连续详情中的复杂字段对照 | 720 px |
| 独立页面 | 长表单、多步骤业务、长报告 | 页面布局，不用超长弹窗替代 |

正式页面默认选择居中对话框；侧边抽屉仅保留给客户、批次、商机、加盟等需要对照列表或连续处理的详情。AI 助手使用居中宽工作弹窗。业务调用用 `ActionDialog` 表达居中，用 `ActionDrawer` 显式表达侧边；底层通过 presentation 区分布局并共享材质与生命周期，不由字段数量自动决定侧边展示。

标题栏只放标题与关闭，正文可独立滚动，底部操作区始终有清晰边界。居中弹窗宽度不超过视口减 32 px，最大高度为 `calc(100dvh - 32px)`；手机普通弹窗仍居中，保留 16 px 边距，只有真正的抽屉转全屏。浮层圆角 20 px，采用不透明白底与浮层阴影；长正文、密集表单与数据仍在实白区域阅读，尊重安全区域和软键盘。保留原生控件和模态语义：打开后焦点进入，Tab 留在模态范围，Escape 按关闭策略处理，关闭后回到触发点。

未修改内容直接关闭；有未保存修改时二次确认，默认继续编辑。保存中尝试关闭应解释“正在保存，请稍候再关闭”，不以无反馈的 disabled 代替。危险确认明确对象和影响，作废／关闭等要求原因时不能省略原因字段。

`Dialog` 的 `dirty` 防护仅拦截组件内部关闭请求。调用方不能在还有未保存修改时直接将 `open` 改为 false 绕过防护；成功保存可清除 dirty 后关闭。异步保存、校验、成功反馈由页面层负责。

### 正式浮层生命周期

正式原生 dialog 与旧 CRM portal 使用相同的进入／稳定／退出阶段。关闭请求先完成现有 busy／dirty 判断；父级清空选择对象或保存成功时，presence 仍保留最后有效内容直到退出完成，避免表单先变空或直接消失。对话框进入／退出为 320／180 ms，抽屉为 360／200 ms；容器通过 `data-hy-phase` 与 `data-hy-overlay` 关联共享样式。

退出期间继续保留焦点约束、背景 inert 与滚动锁，完成后才释放并返回焦点；重复关闭只完成一次，快速重开取消旧的退出任务。嵌套浮层从顶层依次关闭，详情转编辑接续显示，不能由旧浮层恢复焦点抢走新浮层焦点。路由离开或登出立即销毁并清理。降低动态、强制颜色或运行中切换这些偏好时立即完成阶段，不依赖动画结束事件才能关闭。

### 正式 Presence、Modal 与 Confirm 接口

以下对应 `src/ui/Presence.tsx` 与正式 `src/components.tsx`，与第 7 节独立样板的 `Dialog` 接口分开。

```ts
type PresencePhase = 'entering' | 'open' | 'exiting';
type PresenceProps = {
  present: boolean;
  children: ReactNode;
  enterMs?: number; // 320
  exitMs?: number; // 180
  onExited?: () => void;
};
// usePresence 返回当前边界的显示阶段及打开意图；边界外为 open / true。
type PresenceState = { phase: PresencePhase; isPresent: boolean };

type ModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean; // false
  busy?: boolean; // false
};
type ConfirmProps = {
  title: string;
  children: ReactNode;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};
```

`Presence` 的受控属性名为 **present**，不是 `open`。`usePresence()` 返回上述 `PresenceState`；`isPresent` 表示当前打开意图，退出期间为 false，但子树仍存在。边界须放在条件渲染外，例如：

```tsx
<Presence present={Boolean(selected)}>
  {selected && (
    <Modal title="客户详情" onClose={() => setSelected(null)}>
      <CustomerDetails customer={selected} />
    </Modal>
  )}
</Presence>
```

`present=false` 时保留最后提交的有效子树，退场完成再卸载；`onExited` 每次关闭最多调用一次，仅供显示结束后的清理，不延迟业务保存和通知。退场可由已注册浮层的退出动画完成事件结束，并有定时兜底；抽屉传入 360／200 ms，Toast 为 220／160 ms。`Modal.busy` 同时阻止关闭按钮、Escape 和遮罩关闭；`Confirm.busy` 还禁用确认与取消。未保存判断由原调用方在更新 `present` 所依赖的业务状态前执行，presence 不新增业务校验规则。

## 5. 状态、空态与反馈

统一 tone：`neutral` 常规、`info` 信息／进行中、`success` 完成、`warning` 注意／待处理、`danger` 错误／风险。状态徽标同时含文字，圆点仅作视觉辅助。业务阶段不被 tone 重命名；“待联系”“已签约”“已关闭”仍使用各自业务含义。

| 状态 | 默认文案 | 恢复动作 |
| --- | --- | --- |
| 首次无数据 | 暂无记录 | 有权限时提供新增／导入 |
| 筛选无结果 | 没有符合条件的记录 | 清除筛选 |
| 加载中 | 正在加载… | 保留结构，避免频繁闪烁 |
| 请求失败 | 加载失败 | 重试 |
| 网络断开 | 网络连接已断开 | 网络恢复后重试 |
| 无权限 | 暂无查看权限 | 合适时返回允许的入口 |

Toast 用于短暂、非阻断的成功反馈；错误或需要行动的消息要能持续看到或在页面重现。重要错误不能只在 2 秒自动消失的提示里出现。内联错误优先于全屏警报；不为一个操作弹出多处相同成功消息。

## 6. 导航、卡片与图表容器

正式侧栏使用 `SidebarNavigation`：工作台为直接入口，其余按授权后的四个业务组生成二级列表，一次只展开一组。组按钮通过 `aria-expanded` 和 `aria-controls` 控制 `hidden` 列表；子项为原始路由链接，当前项提供 `aria-current="page"`。首页默认收起，详情、跨组跳转和前进／后退自动展开目标组；手动收起不因数据刷新被重置。组按钮 48px、子项 44px，展开淡入 180ms、箭头旋转 240ms，减少动态和强制颜色禁用这些动画。手机沿用 NavigationSurface 的焦点约束、退出生命周期和焦点恢复。完整响应式及角色规则见 pages.md 的二级导航交互。

- 页面标题和侧栏当前态共同定位；面包屑仅在层级确有需要时使用，不重复当前页标题。标签页表示同一任务下的并列视图。导航／操作层使用浅灰蓝或实白底和柔软投影。
- `Panel` 仅在需要分组时使用，圆角 20 px、实白内容底、克制二级阴影。标题与内容优先用间距区分，不默认给每个卡片标题再加横线。常规卡片不叠加玻璃、重阴影、渐变和装饰图案；环境柔光位于容器之外。
- 正式可交互卡片允许边缘高光与 4 px 视觉层抬升，命中外框、焦点环、排版和真实文字保持稳定；纯数据卡没有误导性的悬停抬升。首页少量重点入口可响应精细指针光泽，触屏、降低动态与强制颜色时关闭；不把指针光泽扩散到全部业务数据卡。
- `MetricCard` 最少为名称与值，单位靠近值；脚注只写必要统计范围／限制。无同口径比较期不加趋势箭头或增长百分比。支持通过 `className` 在有共同语义的指标组中调整容器，不把每个数字都套成独立卡片。
- `ChartFrame` 统一标题、单位、期间、必要口径和数据表入口。图表与替代表格从同一 rows 生成；加载／失败等状态由页面层组合 `EmptyState`。
- 小图不允许掩盖空值或放大很小的数据。当前样板 `BarChart` 仅用于非负计数／值；负值财务图要另行使用支持零基线和正负轴的图形。

### 卡片组合与重点数值

独立样板采用 ui-ux-pro-max 的 Bento Box Grid 建议：按内容重要性组合不同体量的区块，而非让所有卡片等权。经营概览把预计管道金额与三个次级指标合为一张经营摘要，待办形成另一张任务卡；两个图表单独成组。卡片仍使用 MASTER 的实白表面和 16 px 圆角，不采用技能示例中的额外渐变、24 px 圆角或整卡悬浮缩放。

概览主金额是本轮明确的局部字阶扩展：使用 `--hy-font-featured: 48px`、600 字重，移动端回到 `--hy-font-display: 32px`。它只突出首要经营数值，不扩散到普通指标、表格或页面标题；“预计金额，不代表收入”必须保留。其余字号继续遵循 MASTER。

列表筛选、表格与分页合用一个内容容器，内部表格去掉重复外框和圆角。容器层级服务于任务分组，不能通过删除字段标签、状态、错误或统计口径来获得留白。

### 独立样板动效

依据本轮用户明确要求，样板在 `src/ui-spec/motion.css` 增加一次性的丰富动效：页面区块和卡片错峰进入、准确数值的静态文本揭示、条形图由零展开到真实条长，以及新列表项、筛选条件、批量区、浮层、按钮和导航选择的反馈。数值始终保持准确，不滚动虚构中间计数；排序既有行不重播整表擦除。页面环境柔光始终静态，不增加循环扫光、自动旋转或持续跳动。

这属于样板的局部动效记录：区块进入 `--hy-motion-enter: 320ms`，图形展开 `--hy-motion-chart: 480ms`；样板基础控件、面板反馈和对话框使用 120／180／220 ms。正式页面使用 MASTER 第 5 节的独立动效矩阵，不因复用设计原则而引入样板 fixture。优先动画化 `opacity` 和 `transform`，按钮仅移动内部内容，不移动命中区域。键盘进入正在错峰显示的区块时立即取消该区块动画。

`prefers-reduced-motion: reduce` 或 `forced-colors: active` 下禁用这套动画、过渡与平滑滚动，直接显示完整内容和最终数据。动效不会代替加载状态、操作成功反馈或权限说明；实际浏览器检查结果单独记录在 acceptance.md，不由本节预先声明通过。

## 7. 当前组件接口

以下是当前独立样板的导出接口。没有列出的业务 API、自动校验、持久化、分页、网络加载能力不由组件隐式提供。

### Button

```ts
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; // secondary
  size?: 'sm' | 'md' | 'lg'; // md
  loading?: boolean; // false
  icon?: ReactNode;
  iconOnly?: boolean;
}
```

默认 `type="button"`，提交需显式 `type="submit"`；`disabled || loading` 禁用，loading 设置 `aria-busy`。只有图标没有文字时设置 iconOnly 并传 aria-label；旧的仅 icon 调用可兼容识别。原生事件、按钮属性与 className 可透传。

### ActionMenu

```ts
type ActionMenuItem = { label: string; onSelect: () => void; tone?: 'danger' };
type ActionMenuProps = { label: string; items: ActionMenuItem[] };
```

用于行内“更多操作”。`label` 包含当前对象名称；触发器使用显式 `iconOnly` 按钮。菜单通过 portal 脱离表格滚动裁切，弹窗内则挂载到当前 dialog；按触发器位置避让视口。支持方向键、Home/End、Enter/Space、Esc/Tab、外部点击及滚动关闭，关闭后恢复焦点，再执行选项回调。危险操作仍进入原有业务确认框，菜单本身不执行额外业务逻辑。

### Field

```ts
type FieldControlProps = {
  id: string;
  required?: boolean;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
};
type FieldProps = {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
};
```

直接子元素为原生 input／select／textarea 时，自动关联 ID、label、required、aria-invalid、说明 ID，并保留子元素已有的 aria-describedby。错误优先于 hint。自定义复合控件使用函数 children 并传递 control 属性；不把多个无标签输入放在同一个 Field 中。

```tsx
<Field label="城市" required error={cityError}>
  {(control) => (
    <Select {...control} name="city" value={city}
      onValueChange={setCity} options={cities} />
  )}
</Field>
```

### Checkbox、RadioGroup、Switch、Select 与 SegmentedControl

```ts
type ControlOption = { value: string; label: string; disabled?: boolean };

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size'> {
  checked: boolean | 'mixed';
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
}

interface RadioGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ControlOption[];
  name?: string;
  label: ReactNode;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
}

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ControlOption[];
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  'aria-describedby'?: string;
}

interface SegmentedControlProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ControlOption[];
  'aria-label': string;
}
```

这些选择控件均由页面层持有 value／checked，不内置业务持久化。ControlOption.value 必须唯一。Checkbox 的 mixed 对应原生 indeterminate，回调仍返回 boolean；只有图标式复选框而没有可见 label 时，通过原生属性传 aria-label。RadioGroup 自带 fieldset／legend，不重复套 Field 标签；未传 name 时生成组内唯一名称。

Switch 的 label 必填，状态变化通过 onCheckedChange 通知；保存与失败回滚由调用方处理。SegmentedControl 用于少量互斥的视图／密度选项，使用同名 radio 与可访问组名称，不实现多选、菜单或导航链接。

Select 单选且值为 string；暂不提供多选、远程搜索、分页选项或可自由输入。桌面 combobox 用受控 value 渲染，保留原生表单代理以支持 name／required，焦点停留在触发器并用 aria-activedescendant 指示活动项。支持方向键、Home／End、Enter／Space、Escape、Tab 和键入匹配，跳过 disabled 选项；手机原生分支保持相同值与 ARIA 关联。弹层在现有 dialog 内挂载，否则挂到文档容器，滚动／缩放时更新位置。

### DataTable

```ts
type DataColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  sortable?: boolean;
  width?: CSSProperties['width'];
};
interface DataTableProps<T extends { id: string }> {
  columns: DataColumn<T>[];
  rows: T[];
  caption: string;
  density?: 'standard' | 'compact'; // standard
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onSort?: (key: string) => void;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc'; // asc
  renderMobile?: (row: T) => ReactNode;
}
```

传 onSelectionChange 才出现选择列；selected 由页面层控制。排序事件仅通知 key，真正排序和方向切换由页面实现。`width` 使用 React 的 `CSSProperties['width']` 类型，通过 `colgroup` 传给相应列；列宽与表格最小宽度由使用页面按字段内容配置，不表示支持用户拖动或持久化列宽。renderMobile 提供手机卡片内容，否则保留局部滚动表格。当前组件不内置分页、列宽持久化、行跳转和 API 请求。

### Dialog

```ts
interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode | ((requestClose: () => void) => ReactNode);
  kind?: 'dialog' | 'drawer'; // dialog
  wide?: boolean; // false
  busy?: boolean; // false
  dirty?: boolean; // false
}
```

使用原生 dialog 的模态行为与独立未保存确认框，portal 自带样板作用域类。busy 阻止内部关闭并说明原因；dirty 弹出继续编辑／放弃修改；关闭后通知 onClose 并恢复触发焦点。底部“取消”使用函数形式 footer 提供的 requestClose，不直接调用 onClose，以免绕过 busy／dirty 防护。

### StatusBadge、EmptyState 与基础容器

```ts
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type StatusBadgeProps = { tone?: Tone; children: ReactNode }; // neutral
type EmptyStateProps = {
  kind?: 'empty' | 'filtered' | 'error' | 'forbidden' | 'offline' | 'loading';
  title?: string;
  action?: ReactNode;
};
type PanelProps = {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
};
type MetricCardProps = {
  label: string; value: ReactNode; unit?: string; footnote?: string; icon?: ReactNode;
  className?: string;
};
```

EmptyState 默认 kind 为 empty；错误使用 alert，其余状态使用 status。状态适配器属于页面层，组件不根据业务字符串猜测颜色。Panel 的 action 应与该区块相关，MetricCard 的 footnote 可省略。

### ChartFrame 与 BarChart

```ts
type ChartRow = { label: string; value: number | null };
type ChartFrameProps = {
  title: string; unit?: string; period?: string; note?: string;
  rows: ChartRow[]; children: ReactNode;
};
type BarChartProps = { rows: ChartRow[]; tone?: 'blue' | 'cyan' }; // blue
```

ChartFrame 内置图表／数据表切换；null 显示“—”。rows 的 label 必须唯一。当前接口为单值系列，不虚称支持多轴、多系列或 Tooltip 引擎；后续扩展必须同步类型与文档。BarChart 默认从零开始按真实比例绘制，不设置误导性最小柱长。

## 8. 迁移约束

独立样板 CSS 使用独立作用域，不导入业务 App，不修改原接口。正式页面的材质与动效由 `src/ui/`、既有正式主题及旧 CRM 适配层统一维护；后续组件迁移仍须保留真实分页、异步状态、权限与业务校验。不要靠全局覆盖旧 `.button`、`table`、`dialog` 选择器把业务页面强行变成样板。

正式组件默认使用实色背景，不给整个组件设 opacity。用户降低透明度时保持实色，forced-colors 时采用系统色和实线边框；reduced-motion 时关闭非必要过渡。所有降级保留原布局、选择语义、标签、错误、可见焦点与业务内容，不能为视觉效果引入新的 API 或真实数据。

### 加盟档案使用的正式浮层扩展（2026-11-09）

`ActionDrawer`／`ActionDialog` 支持可选 `className`，用于页面级布局；组件自己管理 Presence 时转交可选 `onExited`。退出回调先于子浮层卸载清理，焦点补偿须在下一帧确认原触发点恢复是否成功，不得覆盖仍打开的嵌套弹窗焦点。`ConfirmActionDialog` 增加可选 `cancelLabel`（默认取消）和 `danger`（默认 false）；`RecordNavigation.showReturn` 默认 true，抽屉底栏已有返回操作时可设为 false。原调用默认行为不变。
