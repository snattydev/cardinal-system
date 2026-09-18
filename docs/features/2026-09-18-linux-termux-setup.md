# Linux/Termux setup README (2026-09-18)

## What was done

Rewrote root onboarding so a Linux host can bring up Cardinal without installing
Bun on the machine, and so Android/Termux users have an honest story.

- README status synced to **v0.2.6** (Phase 2 closing on `dev`, freeze PR #12;
  Phase 2.5 / v3 tracking #28). N1 worker is not listed as shipped.
- Canonical development path is Podman Compose: distro packages for Debian /
  Fedora / Arch, first-run secrets via OpenSSL + a one-shot `oven/bun` container,
  published ports `127.0.0.1:8787` / `:5173` / `:8789`.
- Termux appendix: supported as a git/SSH/browser client to a Linux host;
  experimental QEMU-Alpine + Docker pointer ([docker-in-termux](https://github.com/cyberkernelofficial/docker-in-termux))
  with extra `hostfwd` for Cardinal ports. Unsupported; no CI.
- Production block now points at the three-container Quadlet pod in
  `deploy/README.md` (Caddy → nginx SPA → backend, `127.0.0.1:8080:80`).
- Long-term multi-repo extraction order recorded in the README only (frontend
  first). Not scheduled, not executed.
- Optional MCP compose env named in `deploy/env.example`: `CARDINAL_SERVICE_KEY`,
  `CARDINAL_VAULTS`.

## Why

Onboarding on Linux laptops/phones was written as host Bun first, with a
one-liner compose subsection and a stale single-container Quadlet recipe.
Android cannot run Podman; documenting a native Bun exception on Termux would
split the engine story. The freeze on `dev` is v0.2.6 while the README still
said v0.2.5 / Phase 2 in progress.

## Decisions

- Podman is the canonical engine. Host Bun stays a labeled alternative for
  Cloud Agent (`.cursor/install.sh`) and hosts without a container engine.
- Termux = experimental QEMU/Docker inside a VM, not a Bun-on-Termux path and
  not rooted native Docker.
- `proot-distro` is not a container host.
- Canonical compose command remains `podman-compose`. Missing distro package →
  `pipx install podman-compose`, not a second engine.
- Secrets without host Bun: `openssl rand -hex 32` and
  `podman run --rm docker.io/oven/bun:1 bun -e '…Bun.password.hash…'`.
- Split documented, not executed. `AGENTS/structure.md` unchanged.
- Docs only: no runtime, compose, Quadlet, or `docs/roadmap.md` edits; no N1 merge.

## Alternatives considered

- Termux as client-only with no on-device appendix: rejected. Users asked for
  an experimental container path.
- Native Bun on Termux as a documented exception: rejected. Canonical engine
  stays Podman/containers.
- Rooted native Docker (FreddieOliveira gist) as a second appendix: rejected.
- Docs plus landing N1 or starting N9 in the same PR: rejected. Freeze first.

## Files created or modified

- `README.md`
- `deploy/env.example`
- `docs/features/2026-09-18-linux-termux-setup.md` (this file)
