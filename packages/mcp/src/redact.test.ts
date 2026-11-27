import { describe, expect, test } from "bun:test";
import { isSensitiveConfigFilename, redactSecrets } from "./redact";

describe("isSensitiveConfigFilename", () => {
  test("blocks credential, auth, private key, sqlite, and history files", () => {
    const blocked = [
      ".env",
      ".env.local",
      "agents/opencode/auth.json",
      "agents/agy/oauth_creds.json",
      "agents/claude/credentials.json",
      "agents/hermes/secrets.yaml",
      "user/gh/hosts.yml",
      "user/ssh/id_ed25519",
      "user/tls/server.key",
      "user/tls/cert.pem",
      "user/fish/fish_history",
      "agents/omp/sessions/state.sqlite",
      "user/git/.git-credentials",
    ];
    for (const file of blocked) {
      expect(isSensitiveConfigFilename(file)).toBe(true);
    }
  });

  test("allows benign config filenames across agents and user configs", () => {
    const allowed = [
      "agents/opencode/opencode.json",
      "agents/omp/config.toml",
      "agents/agy/mcp_config.json",
      "agents/cursor/settings.json",
      "agents/hermes/config.yaml",
      "user/kitty/kitty.conf",
      "user/fish/config.fish",
      "user/zsh/zshrc",
      "user/starship/starship.toml",
      "user/git/gitconfig",
    ];
    for (const file of allowed) {
      expect(isSensitiveConfigFilename(file)).toBe(false);
    }
  });
});

describe("redactSecrets", () => {
  test("redacts synthetic provider credentials, URL passwords, bearer headers, and PEM keys", () => {
    const skVal = ["sk", "proj", "AbCdEfGh1234567890XyZ"].join("-");
    const ghVal = ["ghp", "1234567890abcdefghijklmnopqr"].join("_");
    const pemHeader = ["-----BEGIN RSA", "PRIVATE KEY-----"].join(" ");
    const pemFooter = ["-----END RSA", "PRIVATE KEY-----"].join(" ");
    const bearerHeader = ["Bearer", "my-super-bearer-value-999"].join(" ");

    const raw = [
      `{`,
      `  "openai": "${skVal}",`,
      `  "github": "${ghVal}",`,
      `  "proxy": "https://alice:hunter2pass@proxy.internal:8080",`,
      `  "headers": { "Authorization": "${bearerHeader}" },`,
      `  "apiKey": "live-raw-value-12345",`,
      `  "safeEnvRef": "\${OPENAI_API_KEY}",`,
      `  "safeOmpRef": "{env:MY_KEY}",`,
      `  "model": "gpt-5"`,
      `}`,
      `export MY_SECRET_VAL=unquotedvalue999`,
      `${pemHeader}\nMIIBOgIBAAJBALeFakeKeyMaterial\n${pemFooter}`,
    ].join("\n");

    const res = redactSecrets(raw);
    expect(res.redactedCount).toBeGreaterThanOrEqual(6);
    expect(res.text).not.toContain(skVal);
    expect(res.text).not.toContain(ghVal);
    expect(res.text).not.toContain("hunter2pass");
    expect(res.text).not.toContain("my-super-bearer-value-999");
    expect(res.text).not.toContain("live-raw-value-12345");
    expect(res.text).not.toContain("unquotedvalue999");
    expect(res.text).not.toContain("MIIBOgIBAAJBALeFakeKeyMaterial");

    // Non-secret config and env placeholders stay intact.
    expect(res.text).toContain('"model": "gpt-5"');
    expect(res.text).toContain('"safeEnvRef": "${OPENAI_API_KEY}"');
    expect(res.text).toContain('"safeOmpRef": "{env:MY_KEY}"');
    expect(res.text).toContain("[REDACTED]");
  });

  test("redacting an already redacted payload is idempotent with 0 new redactions", () => {
    const first = redactSecrets(`token = "abc123secretvalue"`);
    expect(first.redactedCount).toBe(1);
    const second = redactSecrets(first.text);
    expect(second.redactedCount).toBe(0);
    expect(second.text).toBe(first.text);
  });
});
