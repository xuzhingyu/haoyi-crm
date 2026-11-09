# Project instructions

## Interface writing and layout

Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

避免不必要的次要标签和描述，让布局本身来传达信息。

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for CodeGraph before grep/find or reading files when you need to understand or locate code. Use `codegraph_explore` when available, or `codegraph explore "<symbol names or question>"` from the shell.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

## CRM UI design system

For UI work in this CRM, read `design-system/haoyi-crm/MASTER.md` first, then the relevant component, page, chart, and acceptance specifications in that directory. Keep visual tokens and shared component behavior consistent with the approved v1.2 blue/cyan soft neumorphic style in root design.md: gray-blue surroundings, opaque reading/data surfaces, subtle raised navigation/cards, inset fields, and opaque floating layers. Preserve necessary field labels, validation messages, permission explanations, dangerous-action consequences, and metric definitions.

CRM 界面工作先阅读 `design-system/haoyi-crm/MASTER.md`，再按任务阅读同目录的组件、页面、图表和验收规范。颜色、尺寸和交互遵循根 design.md 与 v1.2 蓝青柔软新拟态规范：灰蓝环境，正文和数据区实白，导航与交互卡柔软凸起、输入轻微内凹、浮层不透明；禁止用视觉调整悄悄改变权限、业务状态或统计口径。

Use semantic native selection controls, explicit `iconOnly` buttons, and Field-provided ID/ARIA bindings for compound controls. Provide opaque fallbacks, reduced-motion handling, and forced-colors support; visual effects must not weaken keyboard access, labels, contrast, or mobile native selection.

The independent UI specification preview lives at `apps/franchise-portal/ui-spec.html` and `apps/franchise-portal/src/ui-spec/`. It uses local fixtures only; do not connect it to production APIs, OIDC, or real customer data. Regular application builds must not include this preview.
