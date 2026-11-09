# 浩宜工作台部署

当前入口为 `https://120.27.208.216/report.html`（独立银白版汇报）与 `/haoyi/`（统一浅色工作台）。旧 `/workbench/` 跳转到统一工作台，旧 API 返回 410。汇报 HTML 的样式、脚本、字体与图片均内嵌，可以单独保存打开。

## 与既有服务的关系

`haoyi-legacy-crm` 挂载原 SQLite，原客户、商机、合同、培训、地图等界面原生并入 `/haoyi/`，API 统一在 `/haoyi/api/v1/crm/*`。旧 `affiliate-workbench-api` 与新闻 worker 停止，原镜像及数据保留。`haoyi-system-api` 平板服务保持独立，本轮没有改造其业务或接入检测数据。

服务使用 Compose 项目 `haoyi-workspace`，当前情报增强发布目录 `/opt/haoyi-workspace/releases/20261106-intelligence`，私有配置 `/opt/haoyi-workspace/shared`。`20261105-integrated` 是前次整合发布目录，保留为历史基线。两个 Keycloak 账号显式映射原 `lin/id=1` 和 `leader/id=2`，无第二次登录；未映射及加盟账号不能访问旧业务。私有配置和账号交接文件不进入 Git 或静态站点。

## 构建和发布

1. 按 `infra/deploy/vendor-lock.json` 固定版本准备 AIHOT、agent-autoloop，保留各自许可。其模型调用关闭；研究调用统一经过后端预算网关。本次 AIHOT 还包含浩宜私有同步补丁 `packages/backend/src/admin/haoyi-sync.ts`、对应管理路由及 `scripts/haoyi-backfill-rss.ts`，不能用未经适配的上游原版覆盖。
2. 前端构建设置 `VITE_BASE_PATH=/haoyi/`、`VITE_API_BASE_URL=/haoyi/api/v1`、`VITE_OIDC_AUTHORITY=https://120.27.208.216/haoyi-auth/realms/haoyi`、`VITE_OIDC_CLIENT_ID=franchise-portal`，执行 `npm run build`。构建明确指定 `vite.config.ts`。
3. `python infra/deploy/bundle.py` 打包白名单目录。通过 `infra/deploy/remote.py` 使用已保存且核对过主机指纹的连接上传；不要打印或复制整份旧环境文件。
4. 远端解包后保证发布目录可由容器运行用户读取，使用 `compose.workspace.yaml` 构建。镜像下载不可达时先核对镜像摘要，禁止使用未知内容的同名镜像。数据库升级使用 `python -m lead_core.intelligence.migrate`；本次须包含情报摘要快照、批注/关注与研究上下文的增量迁移。先使 AIHOT 私有完整同步接口可用，再启动新版同步任务；缺失接口会明确报错，不退回旧关键词窗口。
5. `prepare-secrets.py` 仅选取所需模型配置，首次生成账号与独立服务凭据；已存在配置不覆盖。Keycloak 完整 hostname 必须包含 `/haoyi-auth`；`provision-auth.py` 补全标准 OIDC scopes。
6. 2026-11-05 整合发布使用 `prepare-integration.py`、独立克隆验证和 `activate-integration.sh`，不是早期 `activate.sh`。该次激活脚本绑定已验证镜像与文件摘要，备份并核对数据，保存回退基线，覆盖 HTTP/HTTPS 旧入口。已完成发布不能直接重复运行；本次情报增强使用新的 `20261106-intelligence` 发布目录与单独回退基线，后续发布同样使用新的版本目录。
7. 容器更换 IP 后需要 Nginx reload。登录服务冷启动需等待完成；以公开 discovery endpoint 返回正确 issuer 和实际登录成功为准，不能仅以容器 Running 判断。

## 运行约束

新研究使用既有 DeepSeek 接口；平板已有的千问多模态调用保持原配置。新工作台预算 20 元/天、2 元/任务、最多 6 次调用、20 分钟；部署并发为 1。未知用量保留预留金额。费用按保守单价估算，供应商调价时应同步核对；这不是供应商账单，也不限制平板发出的调用。

既有基线启用人保财险、中国平安、中国太保三个官方来源，以及盖世汽车、CnEVPost 共四个 RSS 来源，原采集间隔为 6 小时。管理员现在可在正式设置页配置来源与 30–1440 分钟采集间隔，当前启用清单和健康状态以服务端为准，详见 [行业信源配置](source-configuration.md)。未适配的监管和协会来源仍显示待核对，不能写成已接通。

本次 AIHOT 同步采用已采集上游库存的完整分页快照和水位增量，每 10 分钟同步一次，每页 200 条，可从中断页续传，并以 5 分钟增量重叠和每日完整复核处理时间边界。CRM 保留来源摘要/摘录、发布时间及摘要快照哈希，个人收藏、关注与批注独立保存。完整库存同步不等于网站全部历史或全文；RSS 历史回填仅覆盖当前 Feed 仍提供的窗口，未提供的内容不能补造。2026-11-05 的“每源最新 30 条加关键词最多 50 条”是旧适配器限制，本次不再使用。具体同步与回填步骤见 [旧工作台信源接续](legacy-news-sources.md)。工作日北京时间 08:30 生成简报；完整周期仍需运行观察。来源性质、原文发布时间和采集时间分别展示。

研究经 agent-autoloop 调度受限后端任务，读取已采集的信源资料并生成引用报告、内部待办。不会执行模型输出的任意代码，不会自动联系客户。正式 CRM 变更另走人工确认、权限检查、版本检查和跨库执行凭据。

服务器为 2 核、约 1.8 GiB 内存，已有 2 GiB 交换文件。`tune-memory.py` 将主机、Docker 父控制组和当前工作台控制组 swappiness 设为 30；Compose 也声明 `mem_swappiness: 30`，避免旧 cgroup 的 0 设置在有空闲交换空间时仍触发全局 OOM。原主机与父控制组值保存在私有 shared 目录。当前验证不等同于长期负载验收。

备份与隔离恢复见 [workspace-backup.md](workspace-backup.md)。不要用新工作台备份覆盖原 CRM 数据库。
