# 备份与恢复演练

脚本备份三个 PostgreSQL 数据库和 MinIO 数据卷。输出目录必须位于加密存储，运行中会短时增加数据库 I/O，建议低峰执行。备份为只读操作，不停止业务；恢复会覆盖现有状态，必须在隔离环境先演练。

```bash
cd infra
bash scripts/backup.sh /secure-backups/haoyi-2026-09-01
```

校验目录中的 `SHA256SUMS`，再复制到异机/异账号存储。至少保留每日、每周、每月三层策略，并单独备份部署密钥；仓库不保存密钥。

恢复演练：

1. 新建隔离服务器并使用相同镜像摘要。
2. 复制备份目录和部署密钥。
3. 启动 PostgreSQL、Redis、MinIO，停止 API/worker/Twenty/Keycloak。
4. 设置 `CONFIRM_RESTORE=haoyi-crm` 后运行恢复脚本。
5. 启动迁移和应用，验证数据库记录数、对象哈希、OIDC 登录、领取、跟进和 Twenty Outbox。
6. 记录开始/结束时间、RTO、可恢复时间点 RPO、异常和签字人。

严禁在未核对目标 Compose 项目名、备份哈希和变更窗口时对生产运行恢复脚本。
