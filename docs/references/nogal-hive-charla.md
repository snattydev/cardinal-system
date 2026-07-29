# Nogal Hive — Anatomía de una plataforma multi-agente

> Charla técnica de **Agustín Diez** (github.com/agusisa), Nogal Labs · Julio 2026
> Fuente: https://nogal-labs.com.ar/hive-charla/
> 
> *"Los modelos ya están. El trabajo es la plataforma."*

---

## Índice

1. [Qué es Hive](#qué-es-hive)
2. [Filosofía de diseño](#filosofía-de-diseño)
3. [Arquitectura de 4 capas](#arquitectura-de-4-capas)
4. [Gateway nogal-ai](#gateway-nogal-ai)
5. [Workers efímeros](#workers-efímeros)
6. [Modelo fork de git](#modelo-fork-de-git)
7. [Token economics (tiers)](#token-economics-tiers)
8. [Human-in-the-loop](#human-in-the-loop)
9. [Memoria compartida](#memoria-compartida)
10. [Incidente real: la noche de los USD 10](#incidente-real-la-noche-de-los-usd-10)
11. [Fixes post-mortem](#fixes-post-mortem)
12. [Planes ejecutables](#planes-ejecutables)
13. [5 lecciones transferibles](#5-lecciones-transferibles)
14. [Qué aplica al Cardinal System](#qué-aplica-al-cardinal-system)

---

## Qué es Hive

Plataforma multi-agente interna de Nogal Labs donde agentes AI trabajan como un equipo de software:

```
CHAT → QUEUE → WORKER → PR → HUMANO (merge)
```

- **6 roles**: developer, devops, research, analyst, writer, secops
- **1 VPS**: Next.js + Express + Postgres + Docker. Sin Kubernetes.
- **100% en producción**: todo corre hoy y tiene PRs mergeados detrás.
- **Flujo**: pedís trabajo por chat → se crea una task → un worker la agarra → resuelve → PR → humano mergea.

---

## Filosofía de diseño

**Tesis**: muchos agentes chicos con permisos mínimos vs. un mega-agente con acceso a todo.

| Mega-agente (❌) | Enjambre Hive (✅) |
|---|---|
| Un solo proceso con acceso a todo | Cada worker nace para UNA task y muere |
| Una alucinación = daño en cualquier lado | Permisos por rol: el token ve lo mínimo |
| Contexto gigante, carísimo por turno | Contexto chico y fresco por run |
| Imposible auditar: ¿quién hizo qué? | Todo evento queda en el feed, auditable |

**Regla madre**: el sistema asume que el agente puede mentir. Cada claim con efectos (PR abierto, branch pusheado) se verifica contra GitHub antes de creerlo.

---

## Arquitectura de 4 capas

| Capa | Tecnología | Función |
|---|---|---|
| **UI** | Next.js | Chat CEO, feed de memoria en vivo, WorkerDock, vista de PRs multi-repo |
| **Orquesta** | Express + Postgres | Cola de tasks, task_events por SSE, runner de workers, scheduler, RAG con pgvector |
| **Gateway** | nogal-ai | ÚNICO punto de salida a Anthropic. Budget diario por key, usage por proyecto, tiers de modelo |
| **Músculo** | Docker | Workers Hermes efímeros: 512MB, media CPU, sin docker socket, sin mounts del host |

---

## Gateway nogal-ai

**Nadie habla con el proveedor directo.** Todo pasa por el gateway propio.

- **Budget diario** por key: se pasa → 429, no sigue gastando
- **usage.jsonl**: modelo, tokens, USD, proyecto
- **Tiers**: haiku / sonnet / opus
- **Fallback**: segunda key ante 401/429

### Lección cara: el proxy lobotomizador

> El endpoint OpenAI-compat **descartaba las tools**. Los workers narraban comandos en markdown sin ejecutar nada, y reportaban éxito.
>
> ```
> # lo que "hacía" el worker:
> "Ejecuté git push y salió bien"
> # lo que pasó en el mundo real:
> nada.
> ```

**Fix**: passthrough Anthropic-nativo que respeta tools y streaming.

---

## Workers efímeros

Ciclo de vida:

```
SPAWN (docker run, ~5s) → HEALTH (poll 60s) → WORK (30 turnos max) → PUSH (branch al fork) → TEARDOWN (rm container, siempre en finally)
```

**Por qué efímeros**: lo caro son los tokens. El container cuesta 5 segundos y cero tokens. Un worker idle quema 512MB y un slot del cap por días. Mismo modelo mental que runners de GitHub Actions: el estado vive en git, no en el proceso.

### Gotcha: el doble sandbox

> Hermes adentro de Docker con su sandbox interno activo: los archivos se **evaporaban entre comandos**. "El archivo se creó bien" + `cat: No such file`. El container ya es el sandbox: el interno va apagado.

---

## Modelo fork de git

**Problema**: GitHub Free ignora branch rulesets en repos privados. Token con write = puede pushear a main. La única barrera sería el prompt.

**Solución**: modelo fork (como open source clásico):
- El token del worker escribe **SOLO** en el fork de la org espejo
- El PR cross-repo lo abre el **server** con su propia sesión
- Físicamente imposible tocar main del repo principal con las credenciales del worker

**Trust but verify**: el runner confirma con `git ls-remote` que el branch existe en el fork antes de creer el reporte `BRANCH-LISTO`. Los workers también alucinan reportes de éxito.

---

## Token economics (tiers)

Marker en el título de la task: `[haiku]`, `[sonnet]`, `[opus]`. Sin marker → opus (default).

| Tier | Precio (in) | Para |
|---|---|---|
| haiku | $0.8/MTok | Mecánico y acotado: borrar código muerto, renombrar, un archivo |
| sonnet | $3/MTok | Refactor medio: varios archivos, lógica simple, review comments |
| opus | $15/MTok | Criterio: arquitectura, seguridad, bugs sutiles, tareas ambiguas |

> *"Un worker tonto cuesta más en **tiempo humano** revisando un PR malo que lo que ahorra en tokens."*
> 
> Por eso el default es el modelo caro, y el barato se pide explícito.

---

## Human-in-the-loop

El humano no es un paso burocrático: es el **anti-loop**.

Dónde corta el humano:
- **Merge**: siempre una persona, sin excepciones
- **Review bot one-shot**: un PR dispara UNA review; commits nuevos no re-disparan (evita loop infinito de tokens)
- **Chat con confirmación**: desglosa el plan pero espera OK antes de crear tasks
- **Gates de pipeline**: aprobación vía Telegram en pasos irreversibles

> Dos agentes respondiéndose entre sí es un loop infinito de tokens. Cada vuelta del ciclo la cierra una persona: eso pone un techo natural al gasto y al daño.

---

## Memoria compartida

Tres sistemas:

1. **MCP nogal-memory**: key-value por agente + activity log. La Mac, el VPS y Hive leen/escriben lo mismo. Un agente retoma donde otro dejó.

2. **Feed en vivo**: triggers `pg_notify` sobre tablas de negocio → SSE → cada pensamiento, acción y error de cada worker al instante.

3. **RAG navegable**: tasks y memorias embebidas con `nomic-embed` local (Ollama) en `pgvector`. Grafo de similitud: cada nodo se explica y se conecta.

**Regla de UI**: dos capas. Titular humano determinístico ("El worker terminó y hay un PR esperando merge") arriba, detalle técnico plegado abajo.

---

## Incidente real: la noche de los USD 10

Julio 2026. Tres bugs se alinearon:

1. **Cron de agente sin noción de "proyecto activo"**: corriendo cada 15 min con Opus, 14 horas, con cero trabajo que hacer → **55 runs inútiles, USD 10 quemados**.

2. **Tool calls paralelos**: el chat creó 2 tasks idénticas en el mismo segundo. Ambas corrieron.

3. **Task imposible**: el token no veía el repo objetivo → el worker quemó 30 turnos contra 404s. Y corrió **dos veces** (por el bug 2).

> El modelo hizo su trabajo. **La plataforma tenía los agujeros.**

---

## Fixes post-mortem

Cada bug se convirtió en defensa estructural:

| Bug | Fix |
|---|---|
| Cron sin sentido | Política de crons: se pausan cuando el proyecto no está activo |
| Tasks duplicadas | **Dedup a nivel DB**: índice único parcial sobre tasks vivas. La carrera se corta en Postgres |
| Task imposible | **Fail-fast del token**: antes de levantar el container, el server prueba que el token VE el repo objetivo. Muere en el segundo 1, cero tokens |
| Sin visibilidad de costo | **Metering por run**: cada worker atribuye consumo a su task. Al terminar, costo real en el feed y DB |

> Si el agente puede equivocarse, la defensa va donde el agente **no llega**: DB, tokens, red.

---

## Planes ejecutables

El entregable más caro (análisis de Opus) quedaba enterrado como texto truncado en un evento. Ahora:

```
ANALYST (entrega plan, evento kind:plan) → FEED (plan completo, markdown, con costo) → EJECUTAR (botón → chat, plan como contexto) → CHAT (desglosa en tasks, con tier sugerido) → HUMANO (confirma, recién ahí se crean)
```

> Un agente analiza, una persona decide, otros agentes ejecutan. Todo queda medido y auditado.

---

## 5 lecciones transferibles

1. **Todo claim con efectos se verifica contra el mundo real.** Los agentes también alucinan éxito.

2. **Los permisos se definen por capacidad física** (token scoped, fork), el prompt solo acompaña.

3. **Efímero por default.** El estado vive en git y en la DB, jamás en el proceso del agente.

4. **Cada token gastado tiene que ser atribuible** a una task. Lo que se mide, se controla.

5. **El humano cierra cada loop**: merge, confirmación, gates. Es el techo del gasto y del daño.

> Nada de esto depende del proveedor del modelo. Es **diseño de plataforma**.

---

## Qué aplica al Cardinal System

### Alineaciones directas (ya en el diseño)

| Concepto Hive | Cardinal System |
|---|---|
| Workers efímeros (container por task) | Fase 2: one-shot agents con Podman |
| Human-in-the-loop | Principio fundacional del Cardinal |
| API keys con scopes y budgets | Fase 2: API Key Factory |
| Gateway único para modelos | Fase 2: Model Router |
| RAG con vector store | Fase 1: Vault Context Service |
| Feed en vivo | WS ya implementado en Fase 0 (Agent Hub) |
| Memoria compartida entre agentes | Fase 1: Memory Store |
| Tier de modelos por task | No planeado aún → candidato a Fase 2 |

### Lecciones a incorporar

1. **⚠️ Doble sandbox**: si usamos Hermes dentro de containers, verificar que el sandbox interno esté off. El container ES el sandbox.

2. **⚠️ Tool-calling en proxies**: si el Model Router usa endpoint OpenAI-compat, validar que las tools lleguen intactas al modelo. Considerar passthrough nativo.

3. **⚠️ Dedup de tasks**: en Fase 2, cuando el Cardinal pueda crear tasks, usar índice único en DB para evitar duplicados por tool calls paralelos.

4. **⚠️ Fail-fast de permisos**: antes de spawnear un container, verificar que el token/agente efectivamente tiene acceso a lo que necesita.

5. **⚠️ Metering por run**: cada one-shot agent debe reportar tokens consumidos y costo. El feed debe mostrar `$X.XX USD` al terminar.

6. **💡 Modelo fork para git**: si los agentes van a escribir código, el fork model es más seguro que confiar en branch protection rules.

7. **💡 Review bot one-shot**: un PR dispara UNA review. No re-dispara. Evitar loops agente↔agente.

8. **💡 Planes como nodos de primera clase**: el output de un agente analyst debería ser ejecutable (botón → crear tasks).

9. **💡 UI de dos capas**: titular humano determinístico + detalle técnico plegado. Aplica al feed del dashboard.

10. **💡 Default al modelo caro**: "un worker tonto cuesta más en tiempo humano revisando". Opus/default por defecto, barato solo cuando se pide explícito.

---

## Referencias cruzadas

- **Nogal Hive**: https://nogal-labs.com.ar/hive
- **Onboarding IA (mismo autor)**: https://nogal-labs.com.ar/onboarding-ia/ (referenciado en `context/ecosystem.md`)
- **Autor**: Agustín Diez — github.com/agusisa

---

*Documento generado a partir de la charla técnica del 2026-07-24. Las lecciones son transferibles independientemente del stack.*
