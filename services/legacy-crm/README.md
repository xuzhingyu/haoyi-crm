# Integrated legacy CRM backend

This service preserves the existing affiliate CRM API and SQLite business identifiers. Source was imported from the running `affiliate-workbench-api` container on 2026-11-05; regression tests came from its release `20260922-142840`. No database, environment file, password hash, or production credential was imported. Historical demo account passwords were removed from application code. Demo data is never seeded under OIDC or legacy-password deployment modes.

## Deployment contract

- Keep the existing SQLite volume mounted read/write to this API alone. Take and verify a backup before the first upgrade. The new migration adds `external_operations` and `external_lead_links`; it does not rewrite old business records.
- `DATABASE_URL=sqlite:////app/data/affiliate_workbench.db`
- `RUN_MIGRATIONS=1`
- `AUTH_MODE=oidc`, `AUTH_DISABLED=0`, `LEGACY_PASSWORD_LOGIN_ENABLED=0`, `SEED_DEMO_DATA=0`
- `OIDC_ISSUER`: public Keycloak realm issuer; `OIDC_AUDIENCE`: expected API audience; optional `OIDC_JWKS_URL`: internal URL serving that realm's signing keys.
- Optional `OIDC_SUBJECT_MAP` JSON maps subjects to `{id,username,role,enabled?}`. Default explicit identities are subject ending `0011` → legacy ID 1, username `lin`, operator; subject ending `0012` → ID 2, username `leader`, executive. The complete subjects are in `app/oidc.py`. An explicit empty map denies everyone.
- `AI_GATEWAY_URL`: full internal endpoint `/api/v1/internal/ai/chat-completions`; `AI_GATEWAY_TOKEN`: dedicated server credential. Do not configure upstream model credentials in this service.
- `CRM_BRIDGE_TOKEN`: separate server credential for confirmed-operation/reconciliation APIs.
- `PUBLIC_API_PREFIX=/haoyi/api/v1/crm` keeps exported report URLs within the unified entry.
- `LEGACY_NEWS_WORKER_ENABLED=0`: the unified AIHOT pipeline owns collection and briefings. Existing news and favorites remain readable.

Proxy `/haoyi/api/v1/crm/*` to this service's `/api/*`, forwarding the user's Bearer token. Do not trust or synthesize `X-UserId`, `X-Role`, or organization headers. Block `/api/integrations/*` from the public proxy; only the workspace backend calls it internally.

The business API validates the OIDC signature, issuer, audience, expiry, HQ role, explicit subject mapping, and matching legacy user identity. Franchise or unmapped subjects are denied. Existing executive business-write restrictions remain; private notes/contact details/raw history payloads are excluded from executive views. Operator actions retain their original lifecycle rules.

If a rollback explicitly requires the original local password login, both `AUTH_MODE=legacy` and `LEGACY_PASSWORD_LOGIN_ENABLED=1` must be set. Existing passwords stay in the old DB; this code neither resets nor migrates them. OIDC mode always disables the password endpoint.

## Confirmed write bridge

Writes require both the user's valid operator OIDC `Authorization: Bearer …` and `X-Haoyi-Bridge-Token`. CEO cannot call these writes. Every body includes `request_id` (UUID) and `confirmed: true`.

`POST /api/integrations/import-lead` accepts:

```json
{"request_id":"<uuid>","confirmed":true,"source_system":"lead_core","source_id":"<uuid>","lead":{"shop_name":"Example shop","province":"Example province","city":"Example city","district":null,"address":null,"source":"Public lead pool"},"bind_lead_id":null}
```

Only these bounded fields are accepted. A selected existing active CRM lead can be linked by `bind_lead_id`. The source identity is unique and existing CRM data is not overwritten by another import.

`GET /api/integrations/entities/opportunity/{id}` requires both credentials and returns `{entity_type,entity_id,version,status,stage}`.

`POST /api/integrations/confirmed-operations` accepts:

```json
{"request_id":"<uuid>","confirmed":true,"entity_type":"opportunity","entity_id":1,"action":"update_stage","expected_version":"<version from GET>","payload":{"stage":"方案沟通","stage_reason":"Confirmed new progress"}}
```

Signing/closing must use the original lifecycle flow; this bridge cannot bypass it by setting their terminal stage names. Stale versions return 409. Success is `{request_id,status:"applied",entity_type,entity_id,version,replayed}`. The effect, audit and request result commit in one SQLite transaction. A reused ID with different content or actor returns 409; the same ID replays the stored result.

`GET /api/integrations/operations/{request_id}` requires only the service credential and returns `{actor_sub,result}` or 404. This lets the PG proposal outbox reconcile a lost response without storing or replaying user tokens. A missing result remains pending until the operator re-confirms with a valid token.

## AI boundary

The two former direct model call sites now use the shared gateway. `X-Request-ID` (UUID) identifies a model invocation; reuse it for network retries, create a new ID for an explicit new attempt. Purpose values are `operations`, `visit_prep`, `weekly_report`, and `studio_note/preparation/delivery/report`.

Operations use the existing fixed-schema numeric aggregate DTO. Studio drafts send only four record counts; raw user text and customer context remain local and must be checked manually. Responses declare `analysis_scope=aggregate_only` and include a notice. Knowledge matching, feedback rules and template PPTX/PDF exports remain local and do not incur model cost. NEWS model calls have moved to the unified intelligence pipeline.

## Checks

Run `python -m pytest -q` in this directory. Tests create temporary SQLite databases and explicitly opt into test-only users/demo fixtures. The PostgreSQL migration test is skipped unless `POSTGRES_TEST_URL` is explicitly configured; production remains SQLite.
