# Keycloak 加盟商邀请流程

Realm 已关闭公开注册并启用 Organizations。生产域名与 realm import 中的示例重定向地址不一致时，必须先在 Keycloak 管理界面改为实际门户域名。

总部管理员按以下顺序操作：

1. 总部管理员调用 `POST /api/v1/admin/franchisees` 在 Lead Core 创建加盟商记录，确定不可复用的组织 ID。
2. 在 Keycloak 创建同 ID 的 Organization，启用邀请域名限制。
3. 邀请用户前调用 `GET /api/v1/admin/franchisees/{id}/memberships`；已有 3 名时不得发邀请。
4. 用户接受邀请后，在其 Keycloak 用户属性写入同一个 `org_id`，授予 `franchise_owner` 或 `franchise_member`，再调用 `POST /api/v1/admin/franchisees/{id}/memberships` 登记 Membership。服务端会再次执行 3 人上限检查。
5. 让用户重新登录，检查 access token 的 `aud` 包含 `lead-core`、`org_id` 正确且只有所需角色。
6. 禁用/离职时同时撤销 Keycloak 组织成员，并调用 `DELETE /api/v1/admin/franchisees/{id}/memberships/{membership_id}` 删除 Lead Core Membership，再复核未结束 Claim 的归属。

Realm 的 `org-context` client scope 将用户属性映射为 `org_id`。不允许前端在 API 请求体、查询参数或自定义头中覆盖该值。组织变更必须通过双人复核，避免把用户错误分配到另一加盟商。
