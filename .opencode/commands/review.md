---
description: Code review del working tree contra dev — bugs, security, style, suggestions
---

# /review — Code review

1. **@reviewer** analiza el diff del working tree contra `dev` (`git diff dev`).
2. Reportá en formato estructurado:

```
CRITICAL: (bloquea merge — bugs, security)
HIGH: (debería arreglarse antes de merge)
LOW: (sugerencias, estilo)
```

3. Si hay cambios en `auth/`, `keys/`, `ws/` o protocolo → marcá que requiere Security Review.
4. Verificá específicamente: secrets (`sk-cardinal-*`), tipos frontend vs JSON real del backend, drift de timers, endpoints sin auth.
5. NO modifiques archivos. Solo reportás.
