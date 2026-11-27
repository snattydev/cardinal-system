# Security Policy

## Reporting a Vulnerability

Report security vulnerabilities privately through GitHub Security Advisories (**Security -> Report a vulnerability**). Please do not open public issues, pull requests, or discussions containing exploit details until a fix is released.

## Supported Versions

The latest release on `main` (and active pre-release integration on `dev`) receives security updates.

## Deployment Hardening Checklist

- Generate distinct high-entropy secrets (`openssl rand -hex 32`) for `JWT_SECRET`, `POOL_SECRET`, and `INTERNAL_SERVICE_SECRET`.
- Bootstrap `ADMIN_PASSWORD_HASH` via an interactive TTY using `bun run bootstrap:password` (`scripts/bootstrap-admin-password.sh`) or stdin piping; never pass plaintext passwords as command-line arguments.
- Keep `/api/internal/*` blocked at the reverse proxy (`deploy/nginx.conf` returns `403` for `/api/internal/`) and set `INTERNAL_SERVICE_SECRET` when running `cardinal-mcp` alongside `cardinal-backend`.
- Run containers rootless (`deploy/Containerfile` runs as non-root `USER bun`) and mount source vaults read-only (`:ro`).
- Keep local helper proxies (`scripts/omp-gateway.sh`, `scripts/vault-query-proxy.py`) bound to loopback (`127.0.0.1`) with authentication enabled.

Full architecture and security rules: [`docs/security.md`](docs/security.md).
