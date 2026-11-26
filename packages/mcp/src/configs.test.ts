import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, makeConfigStore, MAX_CONFIG_FILE_BYTES } from "./configs";

let root: string;
let outsideFile: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cardinal-configs-test-"));
  outsideFile = join(root, "outside-secret.txt");
  await writeFile(outsideFile, "TOP_SECRET_OUTSIDE=do-not-leak\n");

  await mkdir(join(root, "agents/opencode"), { recursive: true });
  await mkdir(join(root, "agents/omp"), { recursive: true });
  await mkdir(join(root, "user/kitty"), { recursive: true });
  await mkdir(join(root, "user/zsh"), { recursive: true });
  await mkdir(join(root, "user/ssh"), { recursive: true });

  const syntheticSk = ["sk", "proj", "AbCdEfGh1234567890XyZ"].join("-");
  await writeFile(
    join(root, "agents/opencode/opencode.json"),
    JSON.stringify(
      {
        model: "anthropic/claude-sonnet-4",
        provider: {
          openai: { apiKey: syntheticSk },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(join(root, "agents/opencode/auth.json"), `{"token": "should-never-read"}`);
  await writeFile(join(root, "agents/omp/config.toml"), `theme = "dark"\n`);
  await writeFile(join(root, "agents/opencode/escape.json"), "", { flag: "w" }).catch(() => {});
  await rm(join(root, "agents/opencode/escape.json"));
  await symlink(outsideFile, join(root, "agents/opencode/escape.json"));

  await writeFile(join(root, "user/kitty/kitty.conf"), `font_family JetBrains Mono\nfont_size 11\n`);
  await writeFile(join(root, "user/zsh/zshrc"), `export EDITOR=nvim\n`);
  await writeFile(join(root, "user/ssh/id_ed25519"), `PRIVATE_MATERIAL_BLOCKED\n`);
  await writeFile(join(root, "user/kitty/binary.bin"), Buffer.from([0x00, 0x01, 0x02]));
  await writeFile(join(root, "user/kitty/nullbyte"), Buffer.from([0x61, 0x00, 0x62]));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("makeConfigStore", () => {
  test("lists and redacts agent configs with wildcard or config:read:agents/**", async () => {
    const store = makeConfigStore({ configsRoot: root });

    const list = await store.listConfigs(["*"], "agents", { depth: 3 });
    expect(list.available).toBe(true);
    const paths = list.files.map((f) => f.path);
    expect(paths).toContain("opencode/opencode.json");
    expect(paths).toContain("omp/config.toml");
    expect(paths).not.toContain("opencode/auth.json");
    expect(paths).not.toContain("opencode/escape.json");

    const read = await store.readConfig(["config:read:agents/**"], "agents", "opencode/opencode.json");
    expect(read.redactedCount).toBe(1);
    expect(read.content).toContain("[REDACTED]");
    expect(read.content).not.toContain("AbCdEfGh1234567890XyZ");
    expect(read.content).toContain("anthropic/claude-sonnet-4");
  });

  test("blocks sensitive filenames, symlinks, unsupported extensions, binary content, and cross-category reads", async () => {
    const store = makeConfigStore({ configsRoot: root });

    await expect(store.readConfig(["*"], "agents", "opencode/auth.json")).rejects.toThrow(ConfigError);
    await expect(store.readConfig(["*"], "agents", "opencode/escape.json")).rejects.toThrow(ConfigError);
    await expect(store.readConfig(["*"], "agents", "user/kitty/kitty.conf")).rejects.toThrow(ConfigError);
    await expect(store.readConfig(["config:read:user/**"], "user", "ssh/id_ed25519")).rejects.toThrow(
      ConfigError,
    );
    await expect(store.readConfig(["config:read:user/**"], "user", "kitty/binary.bin")).rejects.toThrow(
      ConfigError,
    );
    await expect(store.readConfig(["config:read:user/**"], "user", "kitty/nullbyte")).rejects.toThrow(
      ConfigError,
    );
  });

  test("user configs require strict config:read:user/** opt-in; wildcard * is denied", async () => {
    const store = makeConfigStore({ configsRoot: root });

    const wildcardList = await store.listConfigs(["*"], "user", { depth: 3 });
    expect(wildcardList.totalFiles).toBe(0);

    await expect(store.readConfig(["*"], "user", "kitty/kitty.conf")).rejects.toThrow(ConfigError);

    const optInRead = await store.readConfig(
      ["config:read:user/**"],
      "user",
      "zsh/zshrc",
    );
    expect(optInRead.content).toContain("export EDITOR=nvim");
  });

  test("returns available: false gracefully when configsRoot is unset", async () => {
    const store = makeConfigStore({});
    const list = await store.listConfigs(["*"], "agents");
    expect(list.available).toBe(false);
    expect(list.totalFiles).toBe(0);
    await expect(store.readConfig(["*"], "agents", "opencode/opencode.json")).rejects.toThrow(
      ConfigError,
    );
  });

  test("redacts multi-line PEM private key when maxBytes truncates before raw closing delimiter", async () => {
    const pemHeader = ["-----BEGIN RSA", "PRIVATE KEY-----"].join(" ");
    const pemFooter = ["-----END RSA", "PRIVATE KEY-----"].join(" ");
    const syntheticBody = [
      "SYNTHETIC_PEM_PRIVATE_KEY_PAYLOAD_CHUNK_LINE_ONE_ABCD1234EFGH",
      "SYNTHETIC_PEM_PRIVATE_KEY_PAYLOAD_CHUNK_LINE_TWO_IJKL5678MNOP",
      "SYNTHETIC_PEM_PRIVATE_KEY_PAYLOAD_CHUNK_LINE_THREE_QRST9012UVWX",
    ].join("\n");
    const rawPemBlock = `${pemHeader}\n${syntheticBody}\n${pemFooter}\n`;
    expect(Buffer.byteLength(rawPemBlock, "utf8")).toBeGreaterThan(128);

    const normalConfig = [
      "server_port = 8080",
      "environment = production",
      "log_level = info",
      "worker_threads = 4",
      "cache_ttl_seconds = 3600",
      "max_connections = 1000",
      "keep_alive_timeout = 60",
    ].join("\n") + "\n";

    const configContent = `${rawPemBlock}${normalConfig}`;
    await writeFile(join(root, "agents/opencode/gateway.conf"), configContent);

    const store = makeConfigStore({ configsRoot: root });
    const maxBytes = 128;
    const res = await store.readConfig(
      ["config:read:agents/**"],
      "agents",
      "opencode/gateway.conf",
      maxBytes,
    );

    expect(res.redactedCount).toBeGreaterThanOrEqual(1);
    expect(res.content).toContain("[REDACTED]");
    expect(res.content).not.toContain("SYNTHETIC_PEM_PRIVATE_KEY_PAYLOAD");
    expect(res.truncated).toBe(true);
    expect(res.bytes).toBeLessThanOrEqual(maxBytes);
    expect(res.totalBytes).toBe(Buffer.byteLength(configContent, "utf8"));
  });

  test("rejects config files exceeding MAX_CONFIG_FILE_BYTES", async () => {
    const store = makeConfigStore({ configsRoot: root });
    const oversizedFile = join(root, "agents/opencode/oversized.txt");
    await writeFile(oversizedFile, Buffer.alloc(MAX_CONFIG_FILE_BYTES + 1, 0x61));

    await expect(
      store.readConfig(["config:read:agents/**"], "agents", "opencode/oversized.txt"),
    ).rejects.toThrow(`config file exceeds max readable size (${MAX_CONFIG_FILE_BYTES} bytes)`);
  });
});
