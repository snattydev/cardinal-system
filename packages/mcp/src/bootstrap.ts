import { z } from "zod";
import { canReadPath, normalizeRelativePath, type AclConfig } from "./acl";
import { VaultError, type VaultStore } from "./vaults";
import { SLUG_RE } from "./writer";

export const DEFAULT_BOOTSTRAP_MAX_BYTES = 48_000;
export const HARD_BOOTSTRAP_MAX_BYTES = 96_000;
export const PER_SKILL_MAX_BYTES = 6_000;

export interface BootstrapPresetConfig {
  description: string;
  skills: string[];
  conductCandidates: string[];
}

export const BUILTIN_BOOTSTRAP_PRESETS: Record<string, BootstrapPresetConfig> = {
  default: {
    description:
      "Standard new-repo Configuration 101: conduct rules, caveman brevity, commit/PR workflow, TDD, and planning (write-a-prd, prd-to-issues).",
    skills: [
      "caveman",
      "agent-commit-hygiene",
      "git-conventions",
      "github-pr-workflow",
      "repo-bootstrap",
      "test-driven-development",
      "writing-agents-md",
      "write-a-prd",
      "prd-to-issues",
    ],
    conductCandidates: ["cardinal-system/AGENTS.md", "AGENTS.md", "rules/CONDUCT.md"],
  },
  prd: {
    description:
      "Product & architecture ramp-up (Matt Pocock style): PRD creation, issue slicing, codebase architecture, ubiquitous language, and grill-me.",
    skills: [
      "write-a-prd",
      "prd-to-issues",
      "improve-codebase-architecture",
      "ubiquitous-language",
      "grill-me",
      "tdd",
      "test-driven-development",
      "caveman",
    ],
    conductCandidates: ["cardinal-system/AGENTS.md", "AGENTS.md", "rules/CONDUCT.md"],
  },
  minimal: {
    description: "Minimal new-repo ramp-up: caveman brevity, commit hygiene, and PR workflow.",
    skills: ["caveman", "agent-commit-hygiene", "git-conventions", "github-pr-workflow"],
    conductCandidates: ["cardinal-system/AGENTS.md", "AGENTS.md"],
  },
};

const ManifestPresetSchema = z.object({
  description: z.string().max(300).optional(),
  skills: z.array(z.string().min(1).max(200)).max(32),
  conductCandidates: z.array(z.string().min(1).max(200)).max(10).optional(),
});

const ManifestSchema = z.object({
  presets: z.record(z.string().min(1).max(64), ManifestPresetSchema),
});

const MANIFEST_CANDIDATES = [
  "cardinal-system/bootstrap.md",
  "config/bootstrap.md",
] as const;

const SKILL_PREFIX_CANDIDATES = [
  "skills",
  "for-my-agents/skills",
  "cardinal-system/skills",
] as const;

export interface BootstrapOptions {
  preset?: string;
  project?: string;
  stack?: string;
  skills?: string[];
  extraSkills?: string[];
  includeStarterFiles?: boolean;
  scopes: readonly string[];
  vaultStore: VaultStore;
  aclConfig?: AclConfig;
  maxBytes?: number;
}

export interface BootstrapPacket {
  preset: string;
  availablePresets: Record<string, { description: string; skills: string[] }>;
  markdown: string;
  conductFiles: string[];
  includedSkills: Array<{ requested: string; path: string; bytes: number; truncated: boolean }>;
  missingSkills: string[];
  bytes: number;
  truncated: boolean;
}

function truncateUtf8(text: string, maxBytes: number, notice: string): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, truncated: false };
  }
  const buf = Buffer.from(text, "utf8");
  const noticeBytes = Buffer.byteLength(notice, "utf8");
  if (maxBytes <= noticeBytes + 16) {
    let end = Math.max(0, maxBytes);
    while (end > 0 && (buf[end]! & 0b1100_0000) === 0b1000_0000) {
      end -= 1;
    }
    return { text: buf.subarray(0, end).toString("utf8"), truncated: true };
  }
  let end = maxBytes - noticeBytes;
  while (end > 0 && (buf[end]! & 0b1100_0000) === 0b1000_0000) {
    end -= 1;
  }
  return { text: `${buf.subarray(0, end).toString("utf8").trimEnd()}${notice}`, truncated: true };
}

async function loadEffectivePresets(
  scopes: readonly string[],
  vaultStore: VaultStore,
  aclConfig?: AclConfig,
): Promise<Record<string, BootstrapPresetConfig>> {
  const merged: Record<string, BootstrapPresetConfig> = {};
  for (const [key, val] of Object.entries(BUILTIN_BOOTSTRAP_PRESETS)) {
    merged[key] = {
      description: val.description,
      skills: [...val.skills],
      conductCandidates: [...val.conductCandidates],
    };
  }

  for (const candidate of MANIFEST_CANDIDATES) {
    if (!canReadPath(scopes, candidate, aclConfig)) continue;
    try {
      const doc = await vaultStore.readMarkdown(scopes, candidate, 16_384);
      const match = doc.content.match(/```json\s*\r?\n([\s\S]*?)```/i);
      if (!match?.[1]) continue;
      const parsed = ManifestSchema.safeParse(JSON.parse(match[1]));
      if (!parsed.success) continue;
      for (const [presetName, spec] of Object.entries(parsed.data.presets)) {
        const cleanName = presetName.trim().toLowerCase();
        if (!SLUG_RE.test(cleanName)) continue;
        const existing = merged[cleanName];
        merged[cleanName] = {
          description: spec.description ?? existing?.description ?? `Vault bootstrap preset "${cleanName}".`,
          skills: spec.skills,
          conductCandidates:
            spec.conductCandidates ?? existing?.conductCandidates ?? BUILTIN_BOOTSTRAP_PRESETS.default!.conductCandidates,
        };
      }
      break;
    } catch {
      // Optional vault manifest absent or invalid; continue with defaults.
    }
  }

  return merged;
}

function rankSkillCandidate(filePath: string, slugLower: string): number | null {
  const lower = filePath.toLowerCase();
  if (lower === `skills/coding/${slugLower}/skill.md`) return 1;
  if (lower === `skills/dev/${slugLower}/skill.md`) return 2;
  if (lower.startsWith("skills/") && lower.endsWith(`/${slugLower}/skill.md`)) return 3;
  if (lower.endsWith(`/${slugLower}/skill.md`)) return 4;
  if (lower === `${slugLower}/skill.md`) return 5;
  if (lower === `skills/coding/${slugLower}.md`) return 6;
  if (lower === `skills/dev/${slugLower}.md`) return 7;
  if (lower.startsWith("skills/") && lower.endsWith(`/${slugLower}.md`)) return 8;
  if (lower.endsWith(`/${slugLower}.md`) || lower === `${slugLower}.md`) return 9;
  return null;
}

async function collectDiscoverableFiles(
  scopes: readonly string[],
  vaultStore: VaultStore,
): Promise<string[]> {
  const discovered = new Set<string>();
  for (const prefix of SKILL_PREFIX_CANDIDATES) {
    try {
      const list = await vaultStore.listEntries(scopes, { prefix, depth: 5 });
      for (const file of list.files) {
        discovered.add(file.path);
      }
    } catch {
      // Ignore prefixes invalid under restricted config.
    }
  }
  if (discovered.size === 0) {
    try {
      const list = await vaultStore.listEntries(scopes, { depth: 5 });
      for (const file of list.files) {
        discovered.add(file.path);
      }
    } catch {
      // Ignore if listing unavailable.
    }
  }
  return Array.from(discovered).sort();
}

async function resolveSkillPath(
  requested: string,
  discoverableFiles: string[],
  scopes: readonly string[],
  aclConfig?: AclConfig,
): Promise<string | null> {
  const trimmed = requested.trim();
  if (trimmed === "") return null;

  if (trimmed.includes("/")) {
    try {
      const clean = normalizeRelativePath(trimmed);
      if (!canReadPath(scopes, clean, aclConfig)) return null;
      return clean;
    } catch {
      return null;
    }
  }

  const slugLower = trimmed.toLowerCase();
  let bestPath: string | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const candidate of discoverableFiles) {
    const rank = rankSkillCandidate(candidate, slugLower);
    if (rank !== null && rank < bestRank) {
      bestRank = rank;
      bestPath = candidate;
    }
  }

  if (bestPath !== null && canReadPath(scopes, bestPath, aclConfig)) {
    return bestPath;
  }
  return null;
}

function buildStarterTemplatesSection(project?: string, stack?: string): string {
  const safeName = project ?? "<project-name>";
  const safeStack = stack && stack.trim() !== "" ? stack.trim().replace(/[\r\n]+/g, " ") : "TBD";

  return [
    "## Starter Files (Configuration 101 Boilerplate)",
    "",
    "Write these starter files when bootstrapping an empty repository unless they already exist:",
    "",
    "### Starter `AGENTS.md`",
    "```markdown",
    `# ${safeName} — Agent Conduct & Repo Rules`,
    "",
    `- **Language**: English only for code, comments, identifiers, commits, PRs, and docs.`,
    `- **Stack**: ${safeStack}`,
    `- **Branching**: Work on short-lived \`feature/<slug>\` or \`fix/<slug>\` branches targeting \`dev\` (or \`main\` if single-branch). Never commit directly to protected branches.`,
    `- **Commits**: Use Conventional Commits (\`feat:\`, \`fix:\`, \`chore:\`, \`docs:\`, \`refactor:\`, \`test:\`) <= 72 chars. Stage files explicitly by path (never \`git add -A\` or \`git add .\`). Never add AI co-author attribution.`,
    `- **TDD & Verification**: Write failing tests before or alongside implementation and run full test + typecheck + build before opening a PR.`,
    `- **Security**: Never commit real tokens, \`.env\` files, private keys, or personal host paths.`,
    `- **Repo-Local Skills**: Mirror canonical skill files into \`.agents/skills/<name>/SKILL.md\` so agent harnesses discover them automatically.`,
    "```",
    "",
    "### Starter `.github/PULL_REQUEST_TEMPLATE.md`",
    "```markdown",
    "## Summary",
    "<!-- Concise description of what changed and why. -->",
    "",
    "## Issue",
    "Closes #<issue-number>",
    "",
    "## How to test",
    "- [ ] Unit / integration tests pass",
    "- [ ] Typecheck and build pass",
    "- [ ] Secret/diff audit clean",
    "```",
  ].join("\n");
}

/**
 * Builds a deterministic, ACL-checked New-Repo Bootstrap packet ("Configuration 101")
 * combining readable conduct rules, resolved vault workflow skills, and starter boilerplate.
 */
export async function buildBootstrapPacket(options: BootstrapOptions): Promise<BootstrapPacket> {
  const { scopes, vaultStore, aclConfig } = options;
  const maxBytes = Math.max(
    512,
    Math.min(HARD_BOOTSTRAP_MAX_BYTES, options.maxBytes ?? DEFAULT_BOOTSTRAP_MAX_BYTES),
  );

  let projectSlug: string | undefined;
  if (options.project !== undefined && options.project.trim() !== "") {
    const trimmed = options.project.trim();
    if (!SLUG_RE.test(trimmed)) {
      throw new VaultError(
        "invalid project slug (must match /^[a-z0-9][a-z0-9._-]{0,63}$/)",
      );
    }
    projectSlug = trimmed;
  }

  const presets = await loadEffectivePresets(scopes, vaultStore, aclConfig);
  const availablePresets: Record<string, { description: string; skills: string[] }> = {};
  for (const [k, v] of Object.entries(presets)) {
    availablePresets[k] = { description: v.description, skills: [...v.skills] };
  }

  const requestedPreset = (options.preset ?? "default").trim().toLowerCase() || "default";
  if (requestedPreset === "list") {
    const lines = [
      "# Cardinal New-Repo Bootstrap Presets",
      "",
      "Call `cardinal_bootstrap_repo` with one of the presets below (or specify custom `skills` / `extraSkills`):",
      "",
      ...Object.entries(availablePresets).map(
        ([name, meta]) => `- **\`${name}\`** — ${meta.description}\n  - Default skills: ${meta.skills.map((s) => `\`${s}\``).join(", ")}`,
      ),
      "",
    ];
    const markdown = lines.join("\n");
    return {
      preset: "list",
      availablePresets,
      markdown,
      conductFiles: [],
      includedSkills: [],
      missingSkills: [],
      bytes: Buffer.byteLength(markdown, "utf8"),
      truncated: false,
    };
  }

  const presetSpec = presets[requestedPreset];
  if (!presetSpec) {
    throw new VaultError(
      `unknown bootstrap preset "${requestedPreset}" (valid: ${Object.keys(presets).join(", ")}, list)`,
    );
  }

  const requestedSkillsRaw =
    options.skills && options.skills.length > 0
      ? options.skills
      : presetSpec.skills;
  const combinedRequests = [...requestedSkillsRaw, ...(options.extraSkills ?? [])];
  const dedupedRequests: string[] = [];
  const seenRequests = new Set<string>();
  for (const item of combinedRequests) {
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seenRequests.has(key)) continue;
    seenRequests.add(key);
    dedupedRequests.push(clean);
  }

  const conductFiles: string[] = [];
  const conductBlocks: string[] = [];
  for (const candidate of presetSpec.conductCandidates) {
    if (!canReadPath(scopes, candidate, aclConfig)) continue;
    try {
      const doc = await vaultStore.readMarkdown(scopes, candidate, 8_192);
      conductFiles.push(doc.path);
      conductBlocks.push(`## Conduct Rules (\`${doc.path}\`)\n\n${doc.content.trim()}`);
      break;
    } catch {
      // Optional conduct candidate absent.
    }
  }

  const discoverableFiles = await collectDiscoverableFiles(scopes, vaultStore);
  const includedSkills: Array<{ requested: string; path: string; bytes: number; truncated: boolean }> = [];
  const missingSkills: string[] = [];
  const skillBlocks: string[] = [];
  const loadedPaths = new Set<string>();

  for (const req of dedupedRequests) {
    const resolvedPath = await resolveSkillPath(req, discoverableFiles, scopes, aclConfig);
    if (!resolvedPath) {
      missingSkills.push(req);
      continue;
    }
    if (loadedPaths.has(resolvedPath)) continue;

    try {
      const doc = await vaultStore.readMarkdown(scopes, resolvedPath, PER_SKILL_MAX_BYTES);
      loadedPaths.add(resolvedPath);
      includedSkills.push({
        requested: req,
        path: doc.path,
        bytes: doc.bytes,
        truncated: doc.truncated,
      });
      const note = doc.truncated
        ? `\n\n_[skill truncated at ${PER_SKILL_MAX_BYTES} bytes — call \`cardinal_read\` on \`${doc.path}\` for full text]_`
        : "";
      skillBlocks.push(`### Skill: \`${req}\`\n_Source: \`${doc.path}\`_\n\n${doc.content.trim()}${note}`);
    } catch {
      missingSkills.push(req);
    }
  }

  const headerLines = [
    `# Cardinal New-Repo Bootstrap (Configuration 101 — preset: \`${requestedPreset}\`)`,
    "",
    "Baseline rules and portable workflow skills resolved directly from the Cardinal vault without client-side installation.",
    projectSlug ? `- **Project**: \`${projectSlug}\`` : null,
    options.stack?.trim() ? `- **Stack**: ${options.stack.trim().replace(/[\r\n]+/g, " ")}` : null,
    `- **Included skills (${includedSkills.length})**: ${
      includedSkills.length > 0
        ? includedSkills.map((s) => `\`${s.requested}\` (\`${s.path}\`)`).join(", ")
        : "_none_"
    }`,
    missingSkills.length > 0
      ? `- **Missing or outside key scopes (${missingSkills.length})**: ${missingSkills.map((s) => `\`${s}\``).join(", ")}`
      : null,
  ].filter((line): line is string => line !== null);

  const sections: string[] = [headerLines.join("\n")];
  sections.push(...conductBlocks);

  if (options.includeStarterFiles !== false) {
    sections.push(buildStarterTemplatesSection(projectSlug, options.stack));
  }

  if (skillBlocks.length > 0) {
    sections.push("## Loaded Workflow Skills\n\n" + skillBlocks.join("\n\n---\n\n"));
  }

  const rawMarkdown = sections.join("\n\n") + "\n";
  const bounded = truncateUtf8(
    rawMarkdown,
    maxBytes,
    "\n\n_[bootstrap packet truncated to fit maxBytes; fetch individual skills with `cardinal_read`]_\n",
  );

  return {
    preset: requestedPreset,
    availablePresets,
    markdown: bounded.text,
    conductFiles,
    includedSkills,
    missingSkills,
    bytes: Buffer.byteLength(bounded.text, "utf8"),
    truncated: bounded.truncated,
  };
}
