# 并发与容量验收

只在隔离的验收环境运行。准备 300 个属于不同/指定测试组织的短期 token，不要把 token 提交到仓库。运行会创建领取和审计数据，并对数据库产生约 50 RPS 持续负载。

同一线索 100 并发领取：

```bash
k6 run \
  -e BASE_URL=https://staging.example.com \
  -e LISTING_ID=prepared-available-listing-id \
  -e ACCESS_TOKEN=short-lived-test-token \
  tests/load/claim-race.js
```

阈值要求恰好 1 个 `201`、99 个 `409`，其他状态为 0。运行前确认该 listing 为 `available`，运行后核对只有一个 Claim、一个组织归属和一条 `claim.created` Outbox。

300 账号、50 RPS 门户读取：

```bash
k6 run \
  -e BASE_URL=https://staging.example.com \
  -e TOKENS_FILE=/secure/tmp/franchise-tokens.json \
  tests/load/portal-50rps.js
```

`franchise-tokens.json` 是仅包含 token 字符串的 JSON 数组。验收阈值为失败率低于 1%、P95 小于 500ms。完成后立即删除 token 文件并撤销测试会话。
