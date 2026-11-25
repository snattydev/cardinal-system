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
  await mkdir(join(root, "skills/dev/github-pr-workflow"), { recursive: true });
  await mkdir(join(root, "personal"), { recursive: true });

  await writeFile(join(root, "cardinal-system/AGENTS.md"), "# Conduct\nEnglish only.\n");
  await writeFile(
    join(root, "skills/coding/caveman/SKILL.md"),
    "# Caveman\nWrite terse code and summaries.\n",
  );
  await writeFile(
    join(root, "skills/coding/agent-commit-hygiene/SKILL.md"),
    "# Commit Hygiene\nConventional commits only.\n",
  );
  await writeFile(
    join(root, "skills/coding/write-a-prd/SKILL.md"),
    "# Write a PRD\nStart with problem statement.\n",
  );
  await writeFile(
    join(root, "skills/dev/github-pr-workflow/SKILL.md"),
    "# GitHub PR Workflow\nTarget dev, never main.\n",
  );
  await writeFile(join(root, "personal/secret-skill.md"), "# Personal\nPrivate content.\n");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("buildBootstrapPacket", () => {
  test("resolves conduct rules, skills across coding/dev, and starter files, while reporting missing skills", async () => {
    const store = makeVaultStore({ vaultsRoot: root });
    const packet = await buildBootstrapPacket({
      preset: "default",
      project: "new-app",
      stack: "TypeScript, Bun",
      scopes: ["vault:read:cardinal-system/**", "vault:read:skills/**"],
      vaultStore: store,
    });

    expect(packet.preset).toBe("default");
    expect(packet.conductFiles).toEqual(["cardinal-system/AGENTS.md"]);
    const loadedSlugs = packet.includedSkills.map((s) => s.requested);
    expect(loadedSlugs).toContain("caveman");
    expect(loadedSlugs).toContain("agent-commit-hygiene");
    expect(loadedSlugs).toContain("github-pr-workflow");
    expect(loadedSlugs).toContain("write-a-prd");
    expect(packet.missingSkills).toContain("prd-to-issues");

    expect(packet.markdown).toContain("# new-app — Agent Conduct & Repo Rules");
    expect(packet.markdown).toContain("**Stack**: TypeScript, Bun");
    expect(packet.markdown).toContain("## Starter `.github/PULL_REQUEST_TEMPLATE.md`".replace("## ", "### "));
    expect(packet.markdown).toContain("Write terse code and summaries.");
  });

  test("lists presets without mutating or leaking content when preset='list'", async () => {
    const store = makeVaultStore({ vaultsRoot: root });
    const packet = await buildBootstrapPacket({
      preset: "list",
      scopes: ["vault:read:skills/**"],
      vaultStore: store,
    });

    expect(packet.preset).toBe("list");
    expect(Object.keys(packet.availablePresets)).toEqual(["default", "prd", "minimal"]);
    expect(packet.markdown).toContain("Cardinal New-Repo Bootstrap Presets");
    expect(packet.markdown).toContain("`prd`");
  });

  test("never leaks personal/** skills even with wildcard * and explicit skill request", async () => {
    const store = makeVaultStore({ vaultsRoot: root });
    const packet = await buildBootstrapPacket({
      skills: ["caveman", "personal/secret-skill.md"],
      scopes: ["*"],
      vaultStore: store,
      includeStarterFiles: false,
    });

    expect(packet.includedSkills.map((s) => s.requested)).toEqual(["caveman"]);
    expect(packet.missingSkills).toEqual(["personal/secret-skill.md"]);
    expect(packet.markdown).not.toContain("Private content.");
  });

  test("supports optional vault manifest override in cardinal-system/bootstrap.md", async () => {
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
              custom101: {
                description: "Vault custom ramp-up preset",
                skills: ["caveman"],
              },
            },
          }),
          "```",
        ].join("\n"),
      );

      const store = makeVaultStore({ vaultsRoot: manifestRoot });
      const packet = await buildBootstrapPacket({
        preset: "custom101",
        scopes: ["*"],
        vaultStore: store,
      });

      expect(packet.preset).toBe("custom101");
      expect(packet.availablePresets.custom101?.description).toBe("Vault custom ramp-up preset");
      expect(packet.includedSkills.map((s) => s.requested)).toEqual(["caveman"]);
    } finally {
      await rm(manifestRoot, { recursive: true, force: true });
    }
  });

  test("rejects unknown preset names and invalid project slugs", async () => {
    const store = makeVaultStore({ vaultsRoot: root });
    await expect(
      buildBootstrapPacket({ preset: "does-not-exist", scopes: ["*"], vaultStore: store }),
    ).rejects.toThrow(VaultError);
    await expect(
      buildBootstrapPacket({ project: "../escape", scopes: ["*"], vaultStore: store }),
    ).rejects.toThrow(VaultError);
  });
});
