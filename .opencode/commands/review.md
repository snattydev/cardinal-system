---
description: Working tree code review against dev — bugs, security, style, suggestions
---

# /review — Code review

1. **@reviewer** analyzes the working tree diff against `dev` (`git diff dev`).
2. Report in structured format:

```
CRITICAL: (blocks merge — bugs, security)
HIGH: (should be fixed before merge)
LOW: (suggestions, style)
```

3. If changes exist in `auth/`, `keys/`, `ws/`, or protocol -> flag that Security Review is required.
4. Specifically verify: secrets (`sk-cardinal-*`), frontend types vs actual backend JSON, timer drift, endpoints without auth.
5. Do NOT modify files. Report only.
