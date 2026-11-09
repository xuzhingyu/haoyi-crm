# 旧 CRM 兼容回退

新部署为 SQLite 增加了迁移版本和操作记录。原镜像的迁移器不认识新版本，因此不能直接启动原 API，也不能把数据库降回旧版本。

`infra/deploy/legacy-rollback.py --verify` 先在线备份旧 SQLite 到独立目录，再以原容器的不可变镜像创建禁网临时容器，覆盖 `RUN_MIGRATIONS=0` 并禁用旧模型直连。检查健康、旧 ORM 读取、所有表字段和已有记录哈希；密码、迁移版本及新增操作记录也包含在比较中。环境变量仅通过本地 Docker socket 传递，不进入命令行、配置文件或日志。验证容器随后删除，副本和证明保留在权限受限的 shared 目录。

2026-11-05 已在服务器独立副本验证：30 张表、已有记录及表结构全部不变，新增操作记录保留，旧 ORM 可读。没有停止或修改当前生产服务。该检查证明启动与数据兼容，不代表执行了生产回退。

回退脚本在停止新旧 API 写入后调用 `--apply`。它要求匹配的验证证明，创建独立的 `affiliate-workbench-api-rollback` 容器，挂载原数据目录；原 `affiliate-workbench-api` 容器配置保持原样。旧服务恢复前检查健康，随后将旧入口代理到兼容容器。已有兼容容器只有镜像、环境、数据挂载、网络和启动配置全部匹配时才复用。

回退后保留本地统计、模板和人工业务操作，旧云 AI 和旧自动晨报暂不可用。兼容容器清空 `AI_API_KEY/AI_BASE_URL/AI_MODEL` 和旧 Studio 各通道 `URL/MODEL/KEY`，对应调用次数上限置零；原新闻 worker 保持停止，不携带旧凭据绕过每天 20 元的统一网关。旧容器原始配置不变，认证、数据库、Keycloak 配置也不修改。

独立 HTTP 文件 `affiliate-workbench-ip.conf` 也纳入回退目录。`legacy-nginx-entry.py` 只替换三个已知 `/workbench` location，保持 ACME、tutor 和其他规则不变；支持已使用共享 include 的情况。回退从备份恢复，再把旧 API 上游指向兼容容器，备份原件不修改。

操作顺序：先运行并审查 `--verify`，再由完整的 `rollback-integration.sh` 执行服务与入口恢复。不要单独启动原 API，不要执行 Alembic downgrade，不要用旧数据库备份覆盖已经发生的新业务写入。未来再次激活新版本时也会停止兼容容器，避免两个 API 同时写入。
