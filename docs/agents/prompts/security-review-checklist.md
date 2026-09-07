# Security Review Checklist

Reference checklist for the security reviewer. Each item must be evaluated against the PR diff. If an item does not apply (e.g. no new dependencies), omit with "N/A".

---

## 1. Secrets & Credentials

- [ ] Are there strings that look like hardcoded API keys, tokens, or passwords?
  - Patterns: `sk-*`, `ghp_*`, `gho_*`, `xoxb-*`, `-----BEGIN`, `Bearer`, `Authorization:***`
- [ ] Was `.env.example` modified without documenting the new variables?
- [ ] Are `.env`, `.env.local`, or `credentials.json` files in the diff? (should be in .gitignore)
- [ ] Config files with plaintext secrets? (docker-compose env vars, CI configs, etc.)
- [ ] Are there URLs with embedded credentials? (`https://user:pass@...`)

## 2. Input Validation & Injection

- [ ] Is all user input sanitized/validated?
  - Query params, body, headers, path params, cookies
- [ ] Do SQL queries use parameters or string interpolation?
  - Danger: `db.query(\`SELECT * FROM users WHERE id = ${id}\`)`
  - Safe: `db.query('SELECT * FROM users WHERE id = ?', [id])`
- [ ] Are system commands constructed with user input?
  - Danger: `exec(\`ffmpeg -i ${userFile}\`)`
  - Path traversal: `../../../etc/passwd` in file paths
- [ ] Endpoints that accept unsanitized HTML/markdown? (XSS)
- [ ] File uploads with type, size, and filename validation?
- [ ] Regex vulnerable to ReDoS? (catastrophic backtracking)

## 3. Authentication & Authorization

- [ ] Do new endpoints have access control, or are they unauthenticated?
- [ ] Do JWT tokens validate signature, expiration, issuer, and audience?
- [ ] Do revoked tokens effectively block access?
- [ ] Rate limiting on auth endpoints? (prevents brute force)
- [ ] Do sensitive operations require re-authentication?
- [ ] Is path traversal possible to access unauthorized routes?
- [ ] Are role checks performed server-side (do not trust client-side)?
- [ ] Is IDOR possible? (accessing other users' resources by tampering with IDs)

## 4. CORS, CSRF & Headers

- [ ] Does CORS config allow specific origins or `*`?
- [ ] Do state-changing endpoints (POST/PUT/DELETE) have CSRF protection?
- [ ] Are security headers present?
  - `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`
  - `Strict-Transport-Security`, `Referrer-Policy`
- [ ] Cookies set with proper flags: `HttpOnly`, `Secure`, `SameSite`?

## 5. Cryptography

- [ ] Obsolete algorithms? (MD5, SHA1, DES, RC4)
- [ ] Do random values use `crypto.randomBytes()` instead of `Math.random()`?
- [ ] Are keys generated with sufficient entropy?
- [ ] Hardcoded salts or IVs?
- [ ] Does password hashing use bcrypt/argon2 (no SHA, no MD5)?

## 6. Dependencies & Supply Chain

- [ ] New dependencies added? (review `package.json` diff)
- [ ] Dependencies with known CVEs? (npm audit / pip audit / cargo audit)
- [ ] Dependencies from trusted sources? (typosquatting: `lodahs` vs `lodash`)
- [ ] Dependencies pinned to exact versions or broad ranges?
- [ ] Suspicious post-install scripts in dependencies?

## 7. Error Handling & Logging

- [ ] Do errors expose sensitive information? (stack traces, SQL queries, paths)
- [ ] Do logs include sensitive data? (passwords, tokens, PII, credit cards)
- [ ] Do error responses return generic messages to clients (avoid "user not found" vs "wrong password")?
- [ ] Is error handling present for all paths (no silent failures)?
- [ ] Circuit breakers or retries on external calls?

## 8. File & Data Operations

- [ ] Is path traversal possible in file reads/writes?
- [ ] Are files created with proper permissions? (not world-writable)
- [ ] Are uploads stored outside the web root?
- [ ] User-controlled data in filenames?
- [ ] Database operations wrapped in transactions where appropriate?
- [ ] Are DB migrations reversible? (include `down`)

## 9. Race Conditions & Concurrency

- [ ] Check-then-act operations susceptible to race conditions?
- [ ] Rate limiters that can be bypassed via concurrent requests?
- [ ] Locks or semaphores where shared resources exist?
- [ ] Transactions that assume execution ordering?

## 10. Configuration & Deployment

- [ ] Debug mode disabled in production?
- [ ] Internal ports/endpoints exposed?
- [ ] Insecure configuration defaults?
- [ ] Health check endpoints revealing excessive information?
- [ ] Does CORS allow localhost in production?

---

## Scoring

| Critical | Action |
|---|---|
| >=1 | REQUEST CHANGES — not mergeable |
| 0 critical, >=3 warnings | APPROVE WITH COMMENTS |
| 0 critical, <3 warnings | APPROVE |

---

> *Usage note: this checklist is neither exhaustive nor a replacement for reviewer judgment. It is a scaffold to avoid missing categories. Every PR has its own threat model.*
