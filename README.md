# 浩宜工作台

原 CRM、行业情报、AI 研究与加盟商拓客门户的统一入口。原业务继续使用 SQLite，情报、研究、预算和公开线索池使用 PostgreSQL；通过 Keycloak OIDC 登录。Twenty 只读镜像能力保留，当前部署未启用。

## 已实现

- 公开来源白名单、暂停/撤销、来源级限流、URL 范围校验、HTML/CSV/XLSX/PDF 解析、文档哈希去重、原始快照与字段级证据。
- 目标汽修门店分类、统一社会信用代码/备案号/名称地址去重及人工合并队列语义。
- 原子领取、幂等键、每账号每分钟 10 次 Redis 限流、跨组织隔离与 PostgreSQL RLS。
- 2 个中国工作日首联、7 天跟进、30 天保护与有效沟通续期、90 天冷却、全局禁止联系。
- 总部候选复核、字段分级访问、加盟商建档与每组织最多 3 个成员的服务端约束。
- React 响应式门户：线索池、我的线索、详情、跟进任务、商机；页面含加盟商与时间水印，无导出入口。
- Celery 库存补足、生命周期、30 天原始快照清理与 Twenty Outbox 同步。
- Docker Compose：Caddy HTTPS、Portal、Lead Core、Keycloak、Twenty、PostgreSQL、Redis、MinIO。

## 浩宜工作台与独立汇报

2026-11-05 已上线全浅色统一工作台 `/haoyi/`：原 CRM 的客户、跟进、商机、加盟、培训和经营工作室，与行业情报、AI 研究及待办共用 OIDC 登录。原业务数据继续保存在 SQLite；情报、研究、共享预算和公开线索池保存在 PostgreSQL。独立个人汇报 `/report.html` 单独访问。原 `/workbench/` 返回 308 跳转，原 `/workbench/api/` 返回 410，旧 API 和新闻定时服务已停用。

原 CRM 的经营 AI 与新研究共用每天 20 元服务端预算，平板项目保持独立。最新情报、研究与信源配置范围见 [2026-11-06 增强验收](docs/operations/intelligence-enrichment-20261106.md)；原 CRM 整合、身份边界和数据归属见 [整合上线验收记录](docs/operations/integrated-workspace-acceptance-20261105.md)。早期 [分立部署记录](docs/operations/workspace-acceptance-20261105.md) 仅保留为历史。信源接续限制见 [旧工作台信源接续](docs/operations/legacy-news-sources.md)。

2026-11-06 已上线行业情报增强：AIHOT 上游库存完整快照与水位增量同步、CRM 个人批注及专题/来源关注；管理员可在正式“设置 → AI 与信源”中新增、编辑和测试公开 RSS/网页信源，操作与验证规则见 [行业信源配置](docs/operations/source-configuration.md)。完整同步不代表全网历史或原文全文，RSS 回填仍受来源提供的窗口限制。

## 本地开发

后端：

```powershell
cd services/lead-core
$env:UV_CACHE_DIR='E:\code\haoyi-crm\.uv-cache'
$env:LEAD_CORE_ENVIRONMENT='development'
$env:LEAD_CORE_AUTH_MODE='dev'
$env:LEAD_CORE_DATABASE_URL='sqlite+pysqlite:///./lead-core-dev.db'
$env:LEAD_CORE_AUTO_CREATE_SCHEMA='true'
$env:LEAD_CORE_TWENTY_SYNC_ENABLED='false'
# 首次生成 Fernet 密钥后保存到本机密码管理器或未提交的 .env；同一数据库不得更换密钥。
$env:LEAD_CORE_SENSITIVE_DATA_KEY='replace-with-your-persistent-fernet-key'
uv sync --dev
uv run pytest
uv run python -m lead_core
```

前端：

```powershell
cd apps/franchise-portal
npm.cmd install --cache E:\code\haoyi-crm\.npm-cache
npm.cmd test
npm.cmd run dev
```

开发态门户会发送 `X-User-Id`、`X-Org-Id` 和 `X-Roles`；该认证方式及对应 CORS 请求头只在 `environment=development` 时开放。生产环境必须配置 OIDC。负责人、电话及跟进备注均依赖 `LEAD_CORE_SENSITIVE_DATA_KEY` 解密，即使是本地持久化数据库也不能在重启时重新生成该密钥。

## 部署

```bash
cd infra
cp .env.example .env
# 替换所有 change-me，并将域名指向服务器
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
```

上线前必须完成 [上线闸门](docs/compliance/go-live-gates.md)、[来源登记](docs/data/source-registry.md)、[恢复演练](docs/operations/backup-restore.md)和 [Twenty 配置](docs/operations/twenty-setup.md)。自然人姓名及联系方式默认关闭，不能仅因网页公开而直接启用。

## 目录

- `apps/franchise-portal`：加盟商门户。
- `services/lead-core`：事实源 API、任务、迁移及测试。
- `infra`：容器部署、Keycloak realm、数据库初始化和备份脚本。
- `docs`：架构、设计基线、数据来源、合规与运维手册。

设计概念图：[桌面端](docs/design/portal-desktop-concept.png) / [移动端](docs/design/portal-mobile-concept.png)。

## UI 规范与独立组件样板

统一 UI 规范见 [MASTER](design-system/haoyi-crm/MASTER.md)，包括 [组件](design-system/haoyi-crm/components.md)、[页面与产品规则](design-system/haoyi-crm/pages.md)、[图表与数据口径](design-system/haoyi-crm/charts.md) 和 [验收清单](design-system/haoyi-crm/acceptance.md)。v1.1 采用全浅色蓝青玻璃材质与空间分层，覆盖全业务及桌面／移动端；导航与操作层使用玻璃，正文与表格保持实色。样板的“显示设置”可降低透明度。

本地组件样板独立于正式工作台，使用本地示例数据，不连接业务 API、OIDC 或真实客户数据：

```powershell
cd apps/franchise-portal
npm.cmd run dev:ui-spec
# 浏览器访问 http://127.0.0.1:5174/ui-spec.html
npm.cmd run build:ui-spec
```

入口是 `ui-spec.html`，实现目录为 `src/ui-spec/`，独立构建输出为 `dist-ui-spec`。普通 `npm.cmd run build` 不包含样板。本轮交付规范和组件样板，不代表全站改造或生产发布已完成；检查结果以验收清单实际记录为准。

## 企业动态（2026-11-09）

新增 `/haoyi/companies`，汇总容大、浩宜、横保及已核验控股企业的媒体新闻、经营信息和舆情。首次真实采集覆盖17家企业、508条来源记录，支持来源追溯、分类筛选、北京时间日报和历史回填。管理员启动采集，CEO保持只读；每日08:45调度代码已实现，**本轮未发布生产环境，线上定时任务尚未启用**。

详见[首次综合汇总](docs/company-intelligence-findings-20261109.md)、[天眼接入与部署](docs/operations/company-intelligence-20261109.md)。本机天眼CLI已完成授权；服务器运行账号需另行授权。数据来自天眼当前可返回维度与公开网页，不代表公众号或全网完整历史。
