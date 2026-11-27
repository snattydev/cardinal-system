import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBootstrapPacket } from "./bootstrap";
import { VaultError, makeVaultStore } from "./vaults";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cardinal-bootstrap-test-"));
  await mkdir(join(root, "cardinal-system"), { recursive: true });
  await mkdir(join(root, "skills/coding/caveman"), { recursive: true });
  await mkdir(join(root, "skills/coding/agent-commit-hygiene"), { recursive: true });
  await mkdir(join(root, "skills/coding/write-a-prd"), { recursive: true });
  await mkdir(join(root, "skills/coding/grilling"), { recursive: true });
  await mkdir(join(root, "skills/dev/github-pr-workflow"), { recursive: true });
  await mkdir(join(root, "personal"), { recursive: true });

  await writeFile(join(root, "cardinal-system/AGENTS.md"), "# Conduct\nEnglish only.\n");
  await writeFile(join(root, "skills/coding/caveman/SKILL.md"), "# Caveman\nWrite terse code and summaries.\n");
  await writeFile(
    join(root, "skills/coding/agent-commit-hygiene/SKILL.md"),
    "# Commit Hygiene\nConventional commits only.\n",
  );
  await writeFile(join(root, "skills/coding/write-a-prd/SKILL.md"), "# Write a PRD\nStart with problem statement.\n");
  await writeFile(join(root, "skills/coding/grilling/SKILL.md"), "# Grilling\nWork the design tree in rounds.\n");
  await writeFile(
    join(root, "skills/dev/github-pr-workflow/SKILL.md"),
    "# GitHub PR Workflow\nTarget dev, never main.\n",
  );
  await writeFile(join(root, "personal/secret-skill.md"), "# Personal\nPrivate content.\n");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const READ_SCOPES = ["vault:read:cardinal-system/**", "vault:read:skills/**"];

describe("buildBootstrapPacket", () => {
  test("default preset: conduct rules, alias-resolved skills, standard-tier files, honest missing list", async () => {
    const packet = await buildBootstrapPacket({
      preset: "default",
      project: "new-app",
      stack: "TypeScript, Bun",
      scopes: READ_SCOPES,
      vaultStore: makeVaultStore({ vaultsRoot: root }),
    });

    expect(packet.preset).toBe("default");
    expect(packet.standardsVersion).toBe("1.0.0");
    expect(packet.scope).toBe("standard");
    expect(packet.hooks).toBe("light");
    expect(packet.conductFiles).toEqual(["cardinal-system/AGENTS.md"]);

    const loaded = packet.includedSkills.map((s) => s.requested);
    expect(loaded).toEqual([
      "caveman",
      "agent-commit-hygiene",
      "github-pr-workflow",
      "grilling",
      "write-a-prd",
    ]);
    expect(packet.missingSkills).toContain("to-tickets|prd-to-issues");
    expect(packet.missingSkills).toContain("writing-for-agents|writing-agents-md");

    const filePaths = packet.files.map((f) => f.path);
    for (const p of ["AGENTS.md", "README.md", "CLAUDE.md", ".github/PULL_REQUEST_TEMPLATE.md", ".githooks/pre-commit"]) {
      expect(filePaths).toContain(p);
    }
    expect(filePaths).not.toContain(".githooks/commit-msg");
    expect(packet.complianceChecklist.length).toBeGreaterThan(filePaths.length);

    expect(packet.markdown).toContain("# AGENTS.md — new-app");
    expect(packet.markdown).toContain("**Scope**: `standard` (hooks: `light`)");
    expect(packet.markdown).toContain("Write terse code and summaries.");
    expect(packet.truncated).toBe(false);
  });

  test("tiers follow presets and explicit overrides", async () => {
    const store = makeVaultStore({ vaultsRoot: root });

    const minimal = await buildBootstrapPacket({ preset: "minimal", scopes: READ_SCOPES, vaultStore: store });
    expect(minimal.scope).toBe("lite");
    expect(minimal.hooks).toBe("none");
    expect(minimal.files.map((f) => f.path)).toEqual(["README.md", "AGENTS.md", "CLAUDE.md", ".gitignore"]);

    const full = await buildBootstrapPacket({
      preset: "standards",
      repoScope: "full",
      scopes: READ_SCOPES,
      vaultStore: store,
    });
    expect(full.scope).toBe("full");
    expect(full.hooks).toBe("full");
    expect(full.files.map((f) => f.path)).toContain(".githooks/commit-msg");

    const noHooks = await buildBootstrapPacket({ hooks: "none", scopes: READ_SCOPES, vaultStore: store });
    expect(noHooks.files.some((f) => f.path.startsWith(".githooks/"))).toBe(false);
  });

  test("brainstorm preset loads thinking skills without starter files", async () => {
    const packet = await buildBootstrapPacket({
      preset: "brainstorm",
      scopes: READ_SCOPES,
      vaultStore: makeVaultStore({ vaultsRoot: root }),
    });
    expect(packet.files).toEqual([]);
    expect(packet.complianceChecklist).toEqual([]);
    expect(packet.includedSkills.map((s) => s.requested)).toEqual(["grilling", "write-a-prd"]);
    expect(packet.markdown).toContain("Work the design tree in rounds.");
    expect(packet.markdown).not.toContain("Personal Repo Standards");
  });

  test("lists presets and scope tiers when preset='list'", async () => {
    const packet = await buildBootstrapPacket({
      preset: "list",
      scopes: READ_SCOPES,
      vaultStore: makeVaultStore({ vaultsRoot: root }),
    });
    expect(packet.preset).toBe("list");
    expect(Object.keys(packet.availablePresets)).toEqual(["default", "brainstorm", "standards", "prd", "minimal"]);
    expect(packet.markdown).toContain("Cardinal New-Repo Bootstrap Presets");
    expect(packet.markdown).toContain("## Scope tiers (`scope`)");
    expect(packet.files).toEqual([]);
  });

  test("never leaks personal/** skills even with wildcard * and explicit request", async () => {
    const packet = await buildBootstrapPacket({
      skills: ["caveman", "personal/secret-skill.md"],
      scopes: ["*"],
      vaultStore: makeVaultStore({ vaultsRoot: root }),
      includeStarterFiles: false,
    });
    expect(packet.includedSkills.map((s) => s.requested)).toEqual(["caveman"]);
    expect(packet.missingSkills).toEqual(["personal/secret-skill.md"]);
    expect(packet.markdown).not.toContain("Private content.");
  });

  test("supports vault manifest presets with custom scope in cardinal-system/bootstrap.md", async () => {
    const manifestRoot = await mkdtemp(join(tmpdir(), "cardinal-bootstrap-manifest-"));
    try {
      await mkdir(join(manifestRoot, "cardinal-system"), { recursive: true });
      await mkdir(join(manifestRoot, "skills/coding/caveman"), { recursive: true });
      await writeFile(join(manifestRoot, "skills/coding/caveman/SKILL.md"), "# Caveman\nBrief.\n");
      await writeFile(
        join(manifestRoot, "cardinal-system/bootstrap.md"),
        [
          "# Bootstrap Manifest",
          "```json",
          JSON.stringify({
            presets: {
              custom101: { description: "Vault custom ramp-up preset", skills: ["caveman"], scope: "full" },
            },
          }),
          "```",
        ].join("\n"),
      );

      const packet = await buildBootstrapPacket({
        preset: "custom101",
        scopes: ["*"],
        vaultStore: makeVaultStore({ vaultsRoot: manifestRoot }),
      });
      expect(packet.preset).toBe("custom101");
      expect(packet.scope).toBe("full");
      expect(packet.availablePresets.custom101?.description).toBe("Vault custom ramp-up preset");
      expect(packet.includedSkills.map((s) => s.requested)).toEqual(["caveman"]);
    } finally {
      await rm(manifestRoot, { recursive: true, force: true });
    }
  });

  test("rejects unknown presets and invalid project slugs", async () => {
    const store = makeVaultStore({ vaultsRoot: root });
    await expect(buildBootstrapPacket({ preset: "does-not-exist", scopes: ["*"], vaultStore: store })).rejects.toThrow(
      VaultError,
    );
    await expect(buildBootstrapPacket({ project: "../escape", scopes: ["*"], vaultStore: store })).rejects.toThrow(
      VaultError,
    );
  });
});
