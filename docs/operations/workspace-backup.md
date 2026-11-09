# 新工作台备份与恢复校验

`infra/deploy/backup-verify.py` 在 Linux Docker 主机运行，只备份 Compose 项目 `haoyi-workspace` 的 PostgreSQL `lead_core`、`keycloak`、`aihot`，以及 autoloop 卷内的 `hub.db`。不停止任何服务，不读取或修改旧 `/workbench` 数据库。

部署脚本后，在服务器低峰运行：

```bash
sudo python3 /opt/haoyi-workspace/releases/20261105/infra/deploy/backup-verify.py
```

脚本不通过 SSH 自行连接，也不读取环境文件或打印凭据。依赖主机 Python 3.8+、Docker；PostgreSQL 工具和 SQLite 在线备份分别使用现有 PostgreSQL 容器与 autoloop 容器的 Node 24，不依赖主机 Python 的 `_sqlite3` 模块。固定输出至 `/opt/haoyi-workspace/shared/backups/<UTC时间_随机编号>/`，目录权限 `700`、文件 `600`，同一时刻只允许一次运行。

每个 PostgreSQL 库分别导出一致性快照，用同一个快照执行 `pg_dump` 与源表行数统计。随后恢复至唯一的 `haoyi_verify_<本次编号>_<库名>` 临时库，禁用应用角色连接，核对全部用户表行数，再删除该临时库。备份保留原所有者与权限；隔离校验时不恢复这些权限，也不覆盖任何业务库。autoloop 使用 Node `node:sqlite` 在线备份读取已提交的 WAL 数据，在容器 `/tmp/haoyi-backup-<本次编号>/` 恢复至独立临时文件，检查完整性与表行数；备份复制到主机并核对 SHA-256 后，精确删除该临时目录的文件。其表达式索引依赖 `card_hash`，校验时仅在容器内读取现有 `master.key` 并注册原有纯函数；不输出、传出或备份该密钥，也不导入会写库的应用运行时。

成功需同时满足退出码 `0`、`manifest.json` 的 `status: verified`、四项 `restore_verified: true`。`SHA256SUMS` 可用于复制后校验。失败目录保留，不作为已验证备份使用；进程被强制杀死或主机异常时可能留下本次 `haoyi_verify_...` 临时库或容器 `/tmp/haoyi-backup-...` 目录，依据 `run_id` 精确核对后处理，禁止批量匹配删除。

2026-11-05 已在生产新工作台完成一次备份及隔离恢复，成功目录为 `/opt/haoyi-workspace/shared/backups/20261105t042800z_23446a91/`：`lead_core` 27 张表、`keycloak` 100 张表、`aihot` 59 张表、autoloop 5 张表，恢复行数一致、四份文件 SHA-256 一致；目录 `700`、所有文件 `600`，临时库剩余数量为 0、SQLite 临时目录已清理。PostgreSQL 和 autoloop 均保持运行；未修改旧 CRM。主机 Python 3.9 缺 `_sqlite3`，已通过复用 autoloop 容器 Node 24.22.2 解决，无需安装系统包。

这是每库一致的在线备份，不是跨四库同一时刻的事务快照。恢复校验验证可恢复性和行数，不替代登录、权限和完整业务流程验收。执行时会增加数据库 I/O，并短暂占用一份临时数据库空间。脚本按数据库大小保守检查备份和恢复空间并预留 512 MiB；这不是磁盘预留，仍建议低峰执行并监控余量。

本脚本不包含旧 CRM、Redis、AIHOT 文件卷、autoloop 工作文件和 `master.key`，也不复制部署密钥。完整灾难恢复仍需独立保管 `/opt/haoyi-workspace/shared` 的服务端配置与密钥、autoloop `master.key`；丢失它们可能导致解密失败或已有链接失效。备份本身包含业务数据和认证数据，应复制到受控的加密异机存储并设置保留策略；脚本不会自动清理历史备份。
