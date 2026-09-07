# Security (quick rules)

Minimum rules that apply inside the repo. The full security model lives in [`docs/security.md`](../docs/security.md).

## Repo rules

- Audit leaks before push: keys, tokens, absolute paths, emails.
- `.env` and secrets **never committed** — use `.env.example` as template.
- Agent API keys: format `sk-cardinal-*`, stored as SHA-256 in DB.
- Nothing exposed without auth layer.

## Pre-push audit

```bash
git diff --cached | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'
```

If it matches → fix before push.

Full reference (auth model, scopes, permissions, sensitive data, password bootstrap, WS security): [`docs/security.md`](../docs/security.md).
