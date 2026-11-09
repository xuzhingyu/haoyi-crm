# Design: 浩宜 CRM

已确认的 v1.2 视觉系统，2026-11-09。从组件展厅迁移到正式业务代码，本轮仅在本地预览；所有页面共用本文件，不改变权限、字段、业务流程和统计口径。

## System
- Genre：modern-minimal；应用形态：工作台、业务列表、详情、表单与报告。
- Theme：浩宜蓝青柔软新拟态；灰蓝环境、实白阅读面、清晰边界、克制立体感。
- 品牌蓝用于主要操作，青色用于辅助信息；能源浅绿与深海军蓝只作少量重点强调。
- 保留原有信息架构、主要操作位置、原生选择控件及模态生命周期。避免无意义副标题和说明文字。
- shadcn/ui、Uiverse、SaaSFrame 仅提供视觉与组件组织参考，不移植其业务功能。

## Tokens
唯一正式来源：[tokens.css](apps/franchise-portal/src/ui/tokens.css)。布局仍由现有业务样式负责。
```css
:root {
  --hy-bg: #eaf0f4; --hy-surface: #fff; --hy-surface-subtle: #f0f5f8;
  --hy-sidebar-bg: #e2ebf5; --hy-field-bg: #f7f9fc;
  --hy-primary: #2462e8; --hy-primary-hover: #1d54ce; --hy-primary-soft: #e5edfb;
  --hy-accent: #0b7480; --hy-accent-soft: #edf7f6;
  --hy-text: #20364a; --hy-body: #334b60; --hy-muted: #4e6577;
  --hy-border: #dce5ed; --hy-control-border: #7f8fa5;
  --hy-energy-soft: #e1edce; --hy-energy-ink: #365c24; --hy-deep: #153e58;
  --hy-radius-control: 12px; --hy-radius-panel: 20px; --hy-radius-dialog: 20px;
  --hy-control-height: 48px;
  --hy-soft-raised: 6px 6px 16px #ccd8e1, -6px -6px 16px #fff;
  --hy-field-inset: inset 0 1px 2px rgb(32 54 74 / 7%);
  --hy-shadow-dialog: 0 16px 40px rgb(32 54 74 / 16%);
}
```
字体为系统字体栈，中文按本机字体回退；正文／表格 14px、输入 16px、标签 14px、区块标题 18px、页面标题 24px。数字等宽。间距采用 4 / 8 / 12 / 16 / 24 / 32 / 48px。

## Controls
- 主按钮：蓝底白字；次按钮：白底清晰边框；危险按钮保持危险语义。标准按钮与输入高 48px，密集行内操作至少 44px 触摸区域。
- 输入采用浅色内凹面、独立边框与即时焦点环；标签、验证、禁用、只读和提交锁保留。不能只靠阴影区分控件。
- 内容卡、表格、报告使用不透明底色；柔软双向阴影集中于导航与重点交互卡，数据行不加阴影。
- 弹窗使用不透明白色、20px 圆角及浮层阴影；内容独立滚动，保留 dirty／busy、Escape、焦点约束及关闭后焦点恢复。
- 正式侧栏为两级导航：工作台保留直接入口，工作空间、客户拓展、业务协作、经营管理为可折叠分组，同时只展开一组。首页默认全部收起；进入其他路由或浏览器后退时自动展开所属组，允许手动收起当前组。权限过滤先于分组，不显示空组。
- 宽屏侧栏 224px，768–1279px 保留 200px 文字侧栏，手机沿用最大 280px 模态导航。手机表单单列、工具条换行，表格只在自身容器滚动。不得出现整页横向滚动。

## Motion
- 控件颜色 180ms、选中背景 240ms；按钮仅内部材质层压缩回弹，命中区域与文字稳定，忙碌／禁用状态不触发。
- 页面一次入场 360ms，最大错峰 200ms；排序、筛选和输入不重播整页。卡片只对可交互表面反馈。
- 对话框 320/180ms、抽屉及移动导航 360/200ms、Toast 220/160ms；退出完成才卸载并恢复焦点。
- 子菜单展开采用 180ms 小幅淡入，箭头旋转 240ms；收起即移出键盘焦点序列，原生按钮用 Enter／Space 切换并提供 `aria-expanded`、`aria-controls`。子菜单的当前位置与父组状态一致。
- 数据图形展示真实传入值，禁止装饰性虚构趋势。仅状态变化产生反馈，不增加永久循环装饰。
- `prefers-reduced-motion` 与 `forced-colors` 立即呈现最终状态、关闭非必要运动；强制颜色使用系统色和实线边界。

## Layout and pagination · 2026-11-09
- 首页五项业务指标采用一致的标签与数字基线；重点客户指标保留深蓝色，不跨行拉高。宽屏同排，窄屏按完整指标块换行，不压缩文字；原有数值、链接与权限不变。
- 研究记录使用实白面板。范围切换与状态选择对齐为 48px 高的一行控件，状态标签独立保留；手机按组换行，记录标题、元信息、状态与操作各有稳定空间。
- 正式列表共用 [Pagination](apps/franchise-portal/src/ui/Pagination.tsx)，提供上一页、下一页与每页 `10 / 20 / 50` 条；已知总量才显示范围、总量和页码。手机显示当前页与前后翻页，条数选择独立成行，操作目标至少 44px。
- 完整数组先执行原有筛选、排序再分页；筛选或每页条数改变回到第一页，记录减少时回退到最后有效页。地图、看板、统计与详情相邻记录导航继续使用完整结果，不随列表当前页截断。
- 服务端游标沿用接口顺序和不透明边界，只显示已到达的页与前后操作；未知总量不推算“共多少条”。企业动态使用服务端返回的 `total`。混合待办先读完内部待办游标，再与原业务来源按原规则去重、筛选、按到期日排序后分页，避免后续批次插入已浏览页面。
- 翻页请求中锁定分页控件；筛选切换后的旧响应不得覆盖新结果，请求失败不把旧记录冒充新页。来源失败或仅返回最近记录窗口时，不把当前已加载数量称为全量总数。具体覆盖与保留边界见 [pages.md](design-system/haoyi-crm/pages.md#6-正式列表分页与布局修正2026-11-09)。

## Exports
- [正式材质](apps/franchise-portal/src/theme-light.css)、[共享动效](apps/franchise-portal/src/ui/motion.css)、[完整规范](design-system/haoyi-crm/MASTER.md)、[验收记录](design-system/haoyi-crm/acceptance.md)。
- 本地正式构建预览：`npm run build` → `npm run preview:visual` → `http://127.0.0.1:4176/`。合成数据只由预览服务器提供，不进入正式产物。
- 独立展厅继续位于 `ui-spec.html`；普通业务构建不得导入展厅、其示例数据或展示专用依赖。
