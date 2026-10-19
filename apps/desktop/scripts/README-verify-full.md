# Full automated verification (sample / test DB only)

Use this suite for **发布 / release**. For small bugfixes, run targeted Soft QA
(`npm run typecheck && npm test`) plus related UI checks only.

## Policy

- **Sample / test DB only** — prefer `%APPDATA%\DataAI\sample\retail.db`.
- **Never** query or write production hosts (`展业`, `172.19.161.x`).
- 「新建连接」 smoke: open dialog + cancel only.

## Run

```bash
cd apps/desktop
npm run verify:full
```

Options:

| Flag | Meaning |
|------|---------|
| `--skip-build` | Reuse existing `out/` |
| `--ui-only` | Electron already on CDP `:9222` |
| `--skip-ui` | Soft QA (+ build) only |
| `--keep-open` | Leave Electron running after UI |

Env:

- `DATAAI_CDP_PORT` (default `9222`)
- `DATAAI_SAMPLE_DB` (override sample sqlite path)

## What it runs

1. Soft QA: `npm run typecheck` + `npm test` (vitest)
2. `npm run build` (unless `--skip-build`)
3. Launch Electron with `--remote-debugging-port=9222`
4. `scripts/ui-toolbar-smoke.cjs` — toolbar maximize↔restore/narrow/wide, 「更多」, 「新建连接」 open/cancel

Exit `0` pass · `1` infra · `2` assertion failure.
