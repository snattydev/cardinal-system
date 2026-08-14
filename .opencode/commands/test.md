---
description: TDD workflow — @tester escribe el test (RED), corre (debe fallar), luego @builder implementa (GREEN)
---

# /test [path] — TDD workflow

1. **@tester** escribe el test para el módulo indicado (o el que esté en contexto):
   - Ámbitos con TDD obligatorio: auth, keys, ws, db, router → `*.test.ts` junto al fuente
   - Frontend components → verificación con `bun run build`, no tests unitarios obligatorios
2. **@tester** corre el test — debe FALLAR (RED). Si pasa, el test no está testeando nada real.
3. **@builder** implementa la funcionalidad mínima (GREEN).
4. **@builder** refactorea sin romper tests.
5. **Verificá** que el test completo del paquete pase: `bun test`.
