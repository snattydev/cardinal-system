# Security Review Checklist

Checklist de referencia para el revisor de seguridad. Cada item debe evaluarse contra el diff del PR. Si un item no aplica (ej: no hay nuevas dependencias), se omite con "N/A".

---

## 1. Secrets & Credentials

- [ ] ¿Hay strings que parezcan API keys, tokens, o passwords hardcodeados?
  - Patrones: `sk-*`, `ghp_*`, `gho_*`, `xoxb-*`, `-----BEGIN`, `Bearer`, `Authorization:***`
- [ ] ¿Se modificó `.env.example` sin documentar las nuevas variables?
- [ ] ¿Archivos `.env`, `.env.local`, `credentials.json` en el diff? (deberían estar en .gitignore)
- [ ] ¿Config files con secrets en plaintext? (docker-compose env vars, CI configs, etc.)
- [ ] ¿Hay URLs con credenciales embebidas? (`https://user:pass@...`)

## 2. Input Validation & Injection

- [ ] ¿Todo input de usuario está sanitizado/validado?
  - Query params, body, headers, path params, cookies
- [ ] ¿Consultas SQL usan parámetros o string interpolation?
  - Peligro: `db.query(\`SELECT * FROM users WHERE id = ${id}\`)`
  - Seguro: `db.query('SELECT * FROM users WHERE id = ?', [id])`
- [ ] ¿Hay comandos de sistema construidos con input de usuario?
  - Peligro: `exec(\`ffmpeg -i ${userFile}\`)`
  - Path traversal: `../../../etc/passwd` en file paths
- [ ] ¿Endpoints que aceptan HTML/markdown sin sanitizar? (XSS)
- [ ] ¿File uploads con validación de tipo, tamaño, y nombre?
- [ ] ¿Regex vulnerable a ReDoS? (catastrophic backtracking)

## 3. Authentication & Authorization

- [ ] ¿Nuevos endpoints tienen control de acceso? ¿O están abiertos?
- [ ] ¿JWT tokens validan firma, expiración, issuer, audience?
- [ ] ¿Tokens revocados efectivamente bloquean acceso?
- [ ] ¿Rate limiting en endpoints de auth? (previene brute force)
- [ ] ¿Las operaciones sensibles requieren re-autenticación?
- [ ] ¿Hay path traversal que permita acceder a rutas no autorizadas?
- [ ] ¿Role checks son server-side (no confiar en client-side)?
- [ ] ¿IDOR posible? (acceder a recursos de otro usuario cambiando IDs)

## 4. CORS, CSRF & Headers

- [ ] ¿CORS config permite orígenes específicos o `*`?
- [ ] ¿Endpoints state-changing (POST/PUT/DELETE) tienen CSRF protection?
- [ ] ¿Security headers presentes?
  - `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`
  - `Strict-Transport-Security`, `Referrer-Policy`
- [ ] ¿Cookies con flags: `HttpOnly`, `Secure`, `SameSite`?

## 5. Cryptography

- [ ] ¿Algoritmos obsoletos? (MD5, SHA1, DES, RC4)
- [ ] ¿Random values usan `crypto.randomBytes()` o `Math.random()`?
- [ ] ¿Keys generadas con suficiente entropía?
- [ ] ¿Hardcoded salts o IVs?
- [ ] ¿Password hashing usa bcrypt/argon2 (no SHA, no MD5)?

## 6. Dependencies & Supply Chain

- [ ] ¿Nuevas dependencias añadidas? (revisar `package.json` diff)
- [ ] ¿Dependencias con CVEs conocidos? (npm audit / pip audit / cargo audit)
- [ ] ¿Dependencias de fuentes confiables? (typosquatting: `lodahs` vs `lodash`)
- [ ] ¿Dependencias pineadas a versiones exactas o rangos amplios?
- [ ] ¿Scripts post-install sospechosos en dependencias?

## 7. Error Handling & Logging

- [ ] ¿Errores exponen información sensible? (stack traces, SQL queries, paths)
- [ ] ¿Logs incluyen datos sensibles? (passwords, tokens, PII, credit cards)
- [ ] ¿Errores retornan mensajes genéricos al cliente (no "user not found" vs "wrong password")?
- [ ] ¿Hay error handling para todos los casos (no silent failures)?
- [ ] ¿Circuit breakers o retries en llamadas externas?

## 8. File & Data Operations

- [ ] ¿Path traversal posible en file reads/writes?
- [ ] ¿Archivos creados con permisos correctos? (no world-writable)
- [ ] ¿Uploads almacenados fuera del web root?
- [ ] ¿User-controlled data en nombres de archivo?
- [ ] ¿Operaciones de base de datos en transacciones donde corresponde?
- [ ] ¿Migraciones de DB son reversibles? (tienen `down`)

## 9. Race Conditions & Concurrency

- [ ] ¿Operaciones check-then-act que puedan tener race conditions?
- [ ] ¿Rate limiters que puedan bypassearse con requests paralelos?
- [ ] ¿Locks o semáforos donde hay recursos compartidos?
- [ ] ¿Transacciones que asuman orden de ejecución?

## 10. Configuration & Deployment

- [ ] ¿Debug mode desactivado en producción?
- [ ] ¿Puertos/endpoints internos expuestos?
- [ ] ¿Config defaults inseguros?
- [ ] ¿Health check endpoints revelan demasiada información?
- [ ] ¿CORS permite localhost en producción?

---

## Scoring

| Críticos | Acción |
|---|---|
| ≥1 | REQUEST CHANGES — no mergeable |
| 0 críticos, ≥3 warnings | APPROVE WITH COMMENTS |
| 0 críticos, <3 warnings | APPROVE |

---

> *Guía de uso: este checklist no es exhaustivo ni un reemplazo del criterio del revisor. Es un scaffold para no olvidar categorías. Cada PR tiene su propio threat model.*
