# Twenty 2.26.0 初始化

Compose 将 Twenty 固定为 `v2.26.0` OCI 索引摘要 `sha256:3c5845fb485b57688bb90a202918038c2d4ce3b868c0dad8df3cf79e51c91dd9`。上线前再次检查许可证和该镜像的供应链证明，不要把标签升级与业务发布混在一次变更中。

在 Twenty 管理界面创建以下自定义对象，API name 必须完全一致：

| 对象 | API name | 必要字段 |
|---|---|---|
| 汽修企业 | `repairBusinesses` | `externalId`、`businessName`、`city`、`status`、`lastEventType` |
| 领取 | `leadClaims` | `externalId`、`listingId`、`organizationId`、`status`、`reason`、`lastEventType` |
| 跟进 | `interactions` | `externalId`、`claimId`、`organizationId`、`outcome`、`lastEventType` |
| 商机 | `opportunities` | `externalId`、`claimId`、`organizationId`、`stage`、`expectedValue`、`lastEventType` |
| 联系偏好 | `contactPreferences` | `externalId`、`businessId`、`kind`、`globallyBlocked`、`lastEventType` |
| 线索发布 | `leadListings` | `externalId`、`status`、`lastEventType` |

创建仅用于 Lead Core 的 API Key，写入部署密钥存储并注入 `TWENTY_API_KEY`。不要把 key 写入 `.env.example`、日志或工单。

同步采用 REST `/rest/{objectApiName}`。创建响应没有记录 ID 会被视为失败并重试；远端 ID 保存在 `twenty_mirrors`，后续事件使用 PATCH。Twenty 不得反向写加盟商原始记录。

验收时：先停 Twenty，完成一次领取和跟进，确认 Outbox 保留；恢复 Twenty 后确认每个事件只出现一条镜像记录。
