import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildOnboardPacket } from "./onboard";
import { makeVaultStore } from "./vaults";

const ROOT = join(import.meta.dir, ".tmp-onboard-test");
const VAULTS = join(ROOT, "vaults");
const WRITABLE = join(ROOT, "agent-state");

beforeAll(() => {
  mkdirSync(join(VAULTS, "cardinal-system"), { recursive: true });
  mkdirSync(join(VAULTS, "projects"), { recursive: true });
  mkdirSync(join(VAULTS, "skills", "coding"), { recursive: true });
  mkdirSync(join(VAULTS, "personal"), { recursive: true });
  mkdirSync(join(WRITABLE, "handoffs"), { recursive: true });

  writeFileSync(join(VAULTS, "cardinal-system", "AGENTS.md"), "Follow strict rules.");
  writeFileSync(join(VAULTS, "cardinal-system", "RTK.md"), "Prefer compact output.");
  writeFileSync(join(VAULTS, "cardinal-system", "CODING.md"), "Stateless coding harness.");
  writeFileSync(join(VAULTS, "cardinal-system", "HERMES.md"), "Hermes owns SOUL and USER.");
  writeFileSync(join(VAULTS, "cardinal-system", "USER.md"), "Owner preferences.");
  writeFileSync(join(VAULTS, "cardinal-system", "SOUL.md"), "Must never appear in hermes onboard.");
  writeFileSync(join(VAULTS, "projects", "ACTIVE.md"), "- cardinal-system");
  writeFileSync(join(VAULTS, "skills", "coding", "tdd.md"), "# TDD");
  writeFileSync(join(VAULTS, "personal", "diary.md"), "Private note");
  writeFileSync(join(WRITABLE, "handoffs", "cardinal.md"), "Resume MCP tests.");
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe("buildOnboardPacket", () => {
  const vaultStore = makeVaultStore({ vaultsRoot: VAULTS, writableRoot: WRITABLE });

  test("coding mode loads CODING, USER, ACTIVE, project handoff, topic map, and excludes personal/**", async () => {
    const packet = await buildOnboardPacket({
      mode: "coding",
      project: "cardinal",
      scopes: ["*"],
      vaultStore,
    });

    expect(packet.mode).toBe("coding");
    expect(packet.includedFiles).toEqual([
      "cardinal-system/AGENTS.md",
      "cardinal-system/RTK.md",
      "cardinal-system/CODING.md",
      "cardinal-system/USER.md",
      "projects/ACTIVE.md",
      "agents/handoffs/cardinal.md",
    ]);
    expect(packet.markdown).toContain("Follow strict rules.");
    expect(packet.markdown).toContain("Resume MCP tests.");
    expect(packet.markdown).toContain("skills/coding/");
    expect(packet.markdown).not.toContain("personal/");
    expect(packet.markdown).not.toContain("Private note");
  });

  test("hermes mode skips USER.md and SOUL.md and loads HERMES.md", async () => {
    const packet = await buildOnboardPacket({
      mode: "hermes",
      scopes: ["*"],
      vaultStore,
    });

    expect(packet.mode).toBe("hermes");
    expect(packet.includedFiles).toEqual([
      "cardinal-system/AGENTS.md",
      "cardinal-system/RTK.md",
      "cardinal-system/HERMES.md",
      "projects/ACTIVE.md",
    ]);
    expect(packet.markdown).toContain("Hermes owns SOUL and USER.");
    expect(packet.markdown).not.toContain("Owner preferences.");
    expect(packet.markdown).not.toContain("Must never appear in hermes onboard.");
  });

  test("handles missing optional files and enforces maxBytes budget", async () => {
    const scoped = await buildOnboardPacket({
      mode: "coding",
      project: "nonexistent-proj",
      scopes: ["vault:read:cardinal-system/**"],
      vaultStore,
      maxBytes: 350,
    });

    expect(scoped.missingOptional).toContain("projects/ACTIVE.md");
    expect(scoped.missingOptional).toContain("agents/handoffs/nonexistent-proj.md");
    expect(scoped.bytes).toBeLessThanOrEqual(350);
    expect(scoped.markdown).toContain("truncated to fit context budget");
  });
});
