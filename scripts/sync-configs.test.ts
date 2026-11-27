import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "sync-configs.sh");
let fakeHome: string;
let destDir: string;

beforeAll(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "cardinal-sync-configs-home-"));
  destDir = join(fakeHome, "out-configs");

  mkdirSync(join(fakeHome, ".config/opencode"), { recursive: true });
  mkdirSync(join(fakeHome, ".config/kitty"), { recursive: true });
  mkdirSync(join(fakeHome, ".gemini/antigravity"), { recursive: true });
  mkdirSync(join(fakeHome, ".codex"), { recursive: true });
  mkdirSync(join(fakeHome, ".ssh"), { recursive: true });

  const syntheticSk = ["sk", "proj", "AbCdEfGh1234567890XyZ"].join("-");
  const syntheticGh = ["ghp", "1234567890abcdefghijklmnopqr"].join("_");

  writeFileSync(
    join(fakeHome, ".config/opencode/opencode.json"),
    JSON.stringify({
      model: "anthropic/claude-sonnet-4",
      apiKey: syntheticSk,
      envPlaceholder: "${OPENAI_API_KEY}",
    }),
  );
  // Sensitive credential files sitting right beside allowlisted configs must NOT be copied.
  writeFileSync(join(fakeHome, ".config/opencode/auth.json"), `{"token":"${syntheticGh}"}`);
  writeFileSync(join(fakeHome, ".gemini/antigravity/oauth_creds.json"), `{"refresh_token":"nope"}`);
  writeFileSync(join(fakeHome, ".codex/auth.json"), `{"token":"nope"}`);
  writeFileSync(join(fakeHome, ".codex/config.toml"), `model = "gpt-5"\n`);
  writeFileSync(join(fakeHome, ".ssh/id_ed25519"), "SECRET_SSH_KEY");

  writeFileSync(join(fakeHome, ".config/kitty/kitty.conf"), "font_size 12\n");
  writeFileSync(join(fakeHome, ".zshrc"), `export GITHUB_TOKEN=${syntheticGh}\nexport EDITOR=nvim\n`);
});

afterAll(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("scripts/sync-configs.sh", () => {
  test("copies allowlisted agent & user configs, redacts inline secrets, and omits credential files", () => {
    const res = spawnSync("bash", [SCRIPT, destDir], {
      env: { ...process.env, HOME: fakeHome, XDG_CONFIG_HOME: join(fakeHome, ".config") },
      encoding: "utf8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Synced 4 config file(s)");

    const opencodeOut = readFileSync(join(destDir, "agents/opencode/opencode.json"), "utf8");
    const opencodeJson = JSON.parse(opencodeOut) as Record<string, string>;
    expect(opencodeJson.model).toBe("anthropic/claude-sonnet-4");
    expect(opencodeJson.apiKey).toBe("[REDACTED]");
    expect(opencodeJson.envPlaceholder).toBe("${OPENAI_API_KEY}");
    expect(opencodeOut).not.toContain("AbCdEfGh1234567890XyZ");

    expect(readFileSync(join(destDir, "agents/codex/config.toml"), "utf8")).toContain('model = "gpt-5"');
    expect(readFileSync(join(destDir, "user/kitty/kitty.conf"), "utf8")).toContain("font_size 12");

    const zshrcOut = readFileSync(join(destDir, "user/zsh/zshrc"), "utf8");
    expect(zshrcOut).toContain("export EDITOR=nvim");
    expect(zshrcOut).toContain("[REDACTED]");
    expect(zshrcOut).not.toContain("1234567890abcdefghijklmnopqr");

    // Sensitive files never enter destDir.
    expect(existsSync(join(destDir, "agents/opencode/auth.json"))).toBe(false);
    expect(existsSync(join(destDir, "agents/agy/oauth_creds.json"))).toBe(false);
    expect(existsSync(join(destDir, "agents/codex/auth.json"))).toBe(false);
    expect(existsSync(join(destDir, "user/ssh/id_ed25519"))).toBe(false);
  });
});
