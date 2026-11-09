# 旧工作台信源接续

2026-11-06 实现更新：管理同步已替换为完整分页快照及水位增量，本地补丁与回填步骤见下文。文末 2026-11-05 的最新 30 条限制是旧实现记录，不再是新同步接口的覆盖范围；是否已部署以当次上线验收为准。

旧 SQLite 的资讯、收藏、报告素材标记与晨报历史继续由旧 CRM 保存和读取。本适配只读取公开信源设置与历史数量，不复制用户身份或改写旧记录。停止旧新闻定时采集后，四条有效 RSS 接入新 AIHOT；旧记录不会因为停止采集被删除。

## 发布后的执行

在已加载服务端配置、且以只读方式挂载旧 SQLite 的新 lead-core 容器中运行。配置复用 `LEGACY_CRM_DATABASE_PATH`、`AIHOT_BASE_URL`、`AIHOT_ADMIN_PASSWORD`，不用在命令行填写凭据。

```sh
# 只读预览：验证地址、RSS 内容和原有历史数量
python -m lead_core.intelligence.legacy_sources

# 应用：只写新 AIHOT 与新工作台的信源注册表
python -m lead_core.intelligence.legacy_sources --apply
```

成功导入设置 `interval_minutes=360`。AIHOT 负责实际采集，新工作台 worker 每 10 分钟同步已采集库存；旧 `LEGACY_NEWS_WORKER_ENABLED` 应保持 `0`，不再重复自动采集。此脚本不修改调度器配置。新建 AIHOT 来源会在下次调度进入采集；重复执行按公开 RSS 地址去重并保留上游已有启停状态，不会恢复已暂停来源。无效、停用或非 RSS 来源只登记待核对/暂停，不创建上游采集。

先预览，再应用；成功后检查新工作台来源状态、最新采集时间和原文链接。需要立即验收时，通过工作台已有“刷新”触发同步，或等待 AIHOT 完成首次采集后再刷新。RSS 获取不调用模型。

## 来源和边界

2026-11-05 从原部署只读确认，四条启用 RSS 均返回有效条目：盖世汽车新能源、盖世汽车新技术各 100 条，CnEVPost 行业、政策各 50 条。该检查为当时可用性，后续失败会显示来源状态。

- 盖世汽车：`industry`；CnEVPost：`media`。
- 公开 API：来源 `nature`，资讯和研究引用 `source_nature`，枚举为 `official / industry / media / peer / unknown`。
- 只有已核实的官方域名标 `official`。用户填写“官方”或 AIHOT 的 T1 标签本身不能证明官方性质；未知来源显示待核对。
- 来源元信息存入现有集成游标注册表，无数据库结构迁移。
- 英文条目从各来源详情直接同步，并用中英文关键词补充。当前 AIHOT 管理接口每来源仅返回最新 30 条、每关键词最多 50 条；这不是全历史迁移。高频来源可能在六小时内超出此窗口，需后续提供可分页原始内容接口才能保证全量同步。
- 初次 RSS 回填最多 30 条；保留原文索引和来源时间，不伪造正文或把摘要称为全文。重复原文 URL 在新资讯库去重。
- 原库统计为 32 篇资讯、0 条收藏、49 条晨报任务（本次只读核对）；其历史继续留在原库，本脚本不更改任何旧数据。

## 完整同步与 RSS 回填（2026-11-06）

AIHOT 本地适配补丁位于 `packages/backend/src/admin/haoyi-sync.ts` 与 `apps/api/src/routes/admin.ts`。`GET /api/admin/haoyi/sync` 复用管理员会话鉴权，不是公开 API。只返回当前采集条目的元数据、发布摘要/来源摘录和更新水位，不返回正文、模型回执、凭据或个人信息。首次按 ID 分页全量读取；后续按上次水位增量，采用 5 分钟重叠与每日全量复核。CRM 保存分页进度并通过 URL 去重，内容更新保持 CRM ID、收藏与批注。撤回内容标记 `source_removed`，个人批注保留。

完整同步必须先发布上述 AIHOT API 补丁再启动新版 lead-core。接口未部署时同步显示明确错误，不再悄悄从有限关键词窗口返回成功。`intelligence_cursors.aihot` 的 JSON 包含最后水位/完整快照时间或未完成的分页进度；不得为了重新运行而删除用户数据。每次最多处理 100 页，超过后保留进度，下次继续。

已登记的四条 RSS 可补齐当前 Feed 仍提供的历史条目。在 AIHOT 已加载现有环境的服务容器中运行：

```sh
node scripts/haoyi-backfill-rss.ts
node scripts/haoyi-backfill-rss.ts --apply
```

默认仅输出每源可用/缺失数量；应用只处理已启用、带 `haoyi-legacy-import` 标签的 RSS，每源最多 200 条，跳过已有原文身份。保留来源日期、摘要与历史回填标记，不重置来源游标，不排队模型、不修改旧 SQLite、不改变来源启停状态。完成后运行正常的 `lead_core.intelligence_sync`。这不是全网历史抓取，Feed 未提供的旧条目不凭空补造；不会将回填内容标成今天发布。
