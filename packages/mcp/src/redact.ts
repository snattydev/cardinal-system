import path from "node:path";

const SENSITIVE_DIR_SEGMENTS = new Set([
  ".git",
  ".ssh",
  ".gnupg",
  ".aws",
  ".kube",
  ".docker",
  "secrets",
  "credentials",
  "tokens",
  "sessions",
]);

const SENSITIVE_FILENAME_PATTERNS: readonly RegExp[] = [
  /^\.env(?:\.|$)/i,
  /^(?:\.npmrc|\.netrc|\.pypirc|\.pgpass|\.dockercfg|\.git-credentials)$/i,
  /^(?:known_hosts|authorized_keys)$/i,
  /^id_(?:rsa|ed25519|ecdsa|dsa)(?:\..+)?$/i,
  /(?:^|[-_.])(auth|credential|credentials|secret|secrets|token|tokens|password|passwd|oauth|private|cookie|cookies|history|accounts|sessions?)(?:[-_.]|$)/i,
  /^hosts\.(?:yml|yaml|json|toml)$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore|kdbx|age|gpg|asc|sqlite|sqlite3|db|db-wal|db-shm)$/i,
];

/**
 * Returns true if any segment or basename looks like a secret store, private key,
 * credential file, database, cookie jar, or shell/prompt history file.
 */
export function isSensitiveConfigFilename(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return true;

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!;
    if (SENSITIVE_DIR_SEGMENTS.has(seg.toLowerCase())) {
      return true;
    }
  }

  const base = path.posix.basename(normalized);
  for (const pattern of SENSITIVE_FILENAME_PATTERNS) {
    if (pattern.test(base)) {
      return true;
    }
  }
  return false;
}

export interface RedactResult {
  text: string;
  redactedCount: number;
}

const SAFE_PLACEHOLDER_VALUE_RE =
  /^(?:\[REDACTED\]|\*+|x+|\.{3}|<\s*[^>]+>|\$\{[^}]+\}|\$[A-Z_][A-Z0-9_]*|\{env:[^}]+\}|env:[A-Z0-9_]+|your[-_ ].+|changeme|replace[-_ ]?me|example|dummy|none|null|true|false)$/i;

const KEY_WORD =
  "(?:api[_-]?key|secret|token|password|passwd|private[_-]?key|client[_-]?secret|access[_-]?key|auth[_-]?header|webhook[_-]?secret|signing[_-]?key|bot[_-]?token|pat)";

/**
 * Redacts private keys, known provider token formats, URL basic-auth passwords,
 * bearer/token headers, JWTs, and sensitive key/value pairs in JSON/TOML/YAML/INI/env text.
 */
export function redactSecrets(input: string): RedactResult {
  let text = input;
  let redactedCount = 0;

  const replacePattern = (pattern: RegExp, replacement: string | ((...args: string[]) => string)) => {
    text = text.replace(pattern, (...args: unknown[]) => {
      if (typeof replacement === "function") {
        const strArgs = args.slice(0, -2) as string[];
        const next = replacement(...strArgs);
        if (next !== args[0]) {
          redactedCount += 1;
        }
        return next;
      }
      redactedCount += 1;
      return replacement;
    });
  };

  // 1. Multi-line PEM private key blocks.
  replacePattern(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED]",
  );

  // 2. HTTP Authorization headers (Bearer, Basic, Token).
  replacePattern(
    /(["']?Authorization["']?\s*[:=]\s*["']?(?:Bearer|Basic|Token)\s+)([^\s"',;]+)/gi,
    (_m, prefix: string, val: string) =>
      SAFE_PLACEHOLDER_VALUE_RE.test(val) ? `${prefix}${val}` : `${prefix}[REDACTED]`,
  );

  // 3. Inline URL basic-auth credentials: scheme://user:password@host.
  replacePattern(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:\s/@"']+:)(?!\[REDACTED\])([^@\s"']+)(@)/g,
    (_m, prefix: string, pass: string, at: string) =>
      SAFE_PLACEHOLDER_VALUE_RE.test(pass) ? `${prefix}${pass}${at}` : `${prefix}[REDACTED]${at}`,
  );

  // 4. Known provider token formats.
  replacePattern(
    /\b(?:sk-(?:proj-|svcacct-|ant-|or-v1-|live_|test_)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z\-_]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    "[REDACTED]",
  );

  // 5. Quoted key=val or key: val in JSON / TOML / YAML / INI.
  const quotedAssignmentRe = new RegExp(
    `(["']?[A-Za-z0-9_.-]*${KEY_WORD}[A-Za-z0-9_.-]*["']?\\s*[:=]\\s*)(["'])([^"'\\r\\n]+)(\\2)`,
    "gi",
  );
  replacePattern(
    quotedAssignmentRe,
    (_m, prefix: string, quote: string, val: string) => {
      const trimmed = val.trim();
      if (trimmed.length === 0 || SAFE_PLACEHOLDER_VALUE_RE.test(trimmed)) {
        return `${prefix}${quote}${val}${quote}`;
      }
      return `${prefix}${quote}[REDACTED]${quote}`;
    },
  );

  // 6. Unquoted YAML / dotenv / shell assignment (e.g. API_KEY=abcd... or password: abcd).
  const unquotedAssignmentRe = new RegExp(
    `^(\\s*(?:export\\s+)?[A-Za-z0-9_.-]*${KEY_WORD}[A-Za-z0-9_.-]*\\s*[:=]\\s*)(?!["'{])([^\\s#'"\\r\\n]+)`,
    "gim",
  );
  replacePattern(
    unquotedAssignmentRe,
    (_m, prefix: string, val: string) => {
      const trimmed = val.trim();
      if (trimmed.length === 0 || SAFE_PLACEHOLDER_VALUE_RE.test(trimmed)) {
        return `${prefix}${val}`;
      }
      return `${prefix}[REDACTED]`;
    },
  );

  return { text, redactedCount };
}
