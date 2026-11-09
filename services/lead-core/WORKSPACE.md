# 浩宜工作台后端

工作区接口统一位于 `/api/v1`。总部用户可用行业情报、研究和内部待办；加盟用户继续使用原线索业务接口。`hq_executive` 可以读取总部概况、研究和待办，以及确认商机阶段建议，不能直接修改 CRM 或来源。

## 运行配置

沿用 `LEAD_CORE_*` 环境配置，不向浏览器返回模型密钥、上游管理口令和 worker token。

- `AIHOT_BASE_URL` 与 `AIHOT_ADMIN_PASSWORD`：后台读取 AIHOT 原始采集元数据；上游模型关闭时仍可同步。未配管理口令则使用公开 selected snapshot/changes。
- `AUTOLOOP_BASE_URL`、`AUTOLOOP_SOURCE_TOKEN`：发送 `research.requested` 事件，source 由来源 token 固定，subject 为 `research:{id}`。
- `WORKER_TOKEN`：固定内部 `POST /api/v1/internal/research/run-next` 的鉴权凭据。
- `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`：既有 OpenAI 兼容模型服务。
- `LLM_INPUT_CNY_PER_MILLION`、`LLM_OUTPUT_CNY_PER_MILLION`：核实后的人民币单价，未设置或为零则禁止调用。
- `AI_DAILY_BUDGET_CNY=20`、`AI_TASK_BUDGET_CNY=2`、`AI_MAX_ROUNDS=6`、`AI_TASK_TIMEOUT_MINUTES=20`。

以上短名均需加 `LEAD_CORE_` 前缀。两个模型费用值使用保守的高峰价格。预算是本服务调用账本，不代表供应商账户的全局余额；未知 usage 的请求保留预留额度，不算零费用。

既有独立 CRM 概况可设置 `LEAD_CORE_LEGACY_CRM_DATABASE_PATH`（服务器只读挂载的 SQLite 文件）和 `LEAD_CORE_LEGACY_CRM_URL`（默认 `/workbench/`）。仅总部概况接口读取五张固定业务表的数量，不读取记录、用户或联系方式。查询使用 SQLite `mode=ro` 和只读事务；不可读时返回 `available:false, stats:null`。这不是数据迁移，新旧业务仍分别保存。

迁移：`python -m lead_core.intelligence.migrate`。

总部初始化：`python -m lead_core.intelligence.bootstrap --org <HQ UUID> --admin <徐的用户 UUID> --executive <CEO 用户 UUID>`。密码由 Keycloak 管理，此命令不处理密码。

真实 PostgreSQL 检查：`python -m lead_core.intelligence.pg_smoke`。必须使用普通应用角色；测试 CRM 临时数据回滚，预算和待办使用随机测试行并清理。

## 研究与证据

Autoloop 负责排队/触发，执行器只调用固定内部 worker 接口，不将问题当 shell 指令。后端从已采集资料中检索最多 8 项，限官方域名读取摘录，再生成带编号引用的报告。首页显示真实状态；服务未配、模型失败、引用验证失败或预算不足均不会生成成功结果。

当前研究工具是采集资料检索、受控报告生成，以及主动勾选后的经营汇总读取。`POST /research` 的 `include_business_context` 默认关闭；开启后只读取原 CRM 五项计数和公开线索池状态聚合，两个系统分开统计，缺失数据不伪装成零。生产执行时重新核验创建者的有效总部成员关系。不会读取或发送客户名称、联系方式和备注；汇总快照存入研究记录，作为内部引用提供核对。持续关注和失败重试保留这一选择。

没有通用终端执行、对外发消息、自动修改客户资料或自行登录第三方系统。报告与内部待办可自动创建；商机建议通过 `/proposals` 形成草案，确认时重新校验状态、权限并记审计。当前每项研究生成一份报告，未实现通用自主多轮探索；配置中的轮数和费用是上限，不代表每项任务都会多轮调用。

`GET /research` 支持 `status` 与 `watch` 筛选。`integrations.autoloop` 返回最近派发、开始执行、完成时间及六种任务状态计数；`connected` 仅表示有上游成功接收事件的记录，不等同于此刻实时探活。Linux 固定 runner 会将内部服务的 `failed` 结果作为失败退出，避免并发忙时把未执行的任务当作调度成功。

默认每 10 分钟同步一次 AIHOT 内容（各来源按其配置间隔采集），工作日北京时间 08:30 生成简报及关注主题复查。AIHOT 配置存在时，不重复运行内置 HTML 采集。未配置 AIHOT 时，内置采集明确标注 `direct_html`，仅使用固定官方来源。监管动态栏目尚未适配的来源显示 `pending`。

## 边界

- AIHOT 管理模式使用浩宜私有适配接口 `/api/admin/haoyi/sync`：首次完整遍历已采集库，每页 200 条，此后水位增量；分页游标与数据一起持久化，中断后继续。增量重叠 5 分钟，每日完整复核，修复上游长事务晚提交等时间边界。上游补丁缺失会明确报错，不退回旧的最新 30 条/关键词 50 条窗口。公开出版模式仍使用原有完整快照与增量接口。
- 完整快照指上游当前已采集条目的完整覆盖，不代表互联网上全部历史，也不等同全文。CRM 保留原始标题、URL、发布时间、来源摘要/摘录、同步时间与摘要快照 SHA-256；RSS 摘要明确标记 `rss_excerpt`。上游原文、抓取版本和数据卷继续保留。没有获准的全文不会通过新接口下发。
- 收藏、个人批注与专题/来源关注独立保存于 CRM，重新同步及来源更新不会覆盖。API 只允许用户读取/修改自己的个人记录，总部之外不能读取行业情报。
- 原文无法读取时仅保留索引和已有摘要，模型必须明确证据有限。引用编号检查不等同专家事实核验。
- 停止任务立即取消后续步骤；已发给供应商的单次请求仍可能完成并计费，结果不再发布。
- `hq_executive` 与组织状态由 OIDC 和本地 Membership 一起核验；删除成员或停用组织后，旧 token 不能继续访问。首次登录同步真实显示姓名。
