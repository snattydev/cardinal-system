import { z } from "zod";
import { canReadPath, normalizeRelativePath, type AclConfig } from "./acl";
import {
  REPO_SCOPES,
  REPO_STANDARDS_VERSION,
  SCOPE_GUIDE,
  buildRepoStandardsBlueprint,
  renderRepoStandardsMarkdown,
  resolveHookLevel,
  type HookLevel,
  type RepoScope,
  type RepoStandardFile,
} from "./repo-standards";
import { VaultError, type VaultStore } from "./vaults";
import { SLUG_RE } from "./writer";

export const DEFAULT_BOOTSTRAP_MAX_BYTES = 96_000;
export const HARD_BOOTSTRAP_MAX_BYTES = 196_608;
export const PER_SKILL_MAX_BYTES = 6_000;

export interface BootstrapPresetConfig {
  description: string;
  /** Skill slugs or vault paths. `a|b` resolves to the first alternative found in the vault. */
  skills: string[];
  conductCandidates: string[];
  scope?: RepoScope;
  includeStarterFiles?: boolean;
}

const CONDUCT_CANDIDATES = ["cardinal-system/AGENTS.md", "AGENTS.md", "rules/CONDUCT.md"];

export const BUILTIN_BOOTSTRAP_PRESETS: Record<string, BootstrapPresetConfig> = {
  default: {
    description:
      "New-repo Configuration 101: repo standards for the chosen scope plus brevity, agent-doc writing, work-unit commits, PR flow, TDD, and planning skills.",
    skills: [
      "caveman",
      "writing-for-agents|writing-agents-md",
      "work-unit-commits|agent-commit-hygiene",
      "branch-pr|github-pr-workflow",
      "tdd|test-driven-development",
      "grilling|grill-me",
      "to-spec|write-a-prd",
      "to-tickets|prd-to-issues",
    ],
    conductCandidates: CONDUCT_CANDIDATES,
    scope: "standard",
  },
  brainstorm: {
    description:
      "Socratic design session before code: relentless grilling, domain language and ADRs, then spec and tickets. Skills only, no starter files.",
    skills: [
      "grilling|grill-me",
      "grill-with-docs",
      "domain-modeling|ubiquitous-language",
      "to-spec|write-a-prd",
      "to-tickets|prd-to-issues",
      "improve-codebase-architecture",
    ],
    conductCandidates: CONDUCT_CANDIDATES,
    includeStarterFiles: false,
  },
  standards: {
    description:
      "Audit or retrofit an existing repo to the personal standards (AGENTS.md, README, templates, hooks, repo skills) with the skills that maintain them.",
    skills: [
      "writing-for-agents|writing-agents-md",
      "work-unit-commits|agent-commit-hygiene",
      "branch-pr|github-pr-workflow",
      "git-conventions",
      "repo-bootstrap",
      "setup-pre-commit",
      "caveman",
    ],
    conductCandidates: CONDUCT_CANDIDATES,
    scope: "standard",
  },
  prd: {
    description:
      "Product and architecture ramp-up: spec writing, ticket slicing, architecture review, domain language, grilling, and TDD.",
    skills: [
      "to-spec|write-a-prd",
      "to-tickets|prd-to-issues",
      "improve-codebase-architecture",
      "domain-modeling|ubiquitous-language",
      "grilling|grill-me",
      "tdd|test-driven-development",
      "caveman",
    ],
    conductCandidates: CONDUCT_CANDIDATES,
    scope: "standard",
  },
  minimal: {
    description: "Lite repos (scripts, spikes, small tools): lite standards, brevity, commit hygiene, and PR flow.",
    skills: ["caveman", "work-unit-commits|agent-commit-hygiene", "branch-pr|github-pr-workflow"],
    conductCandidates: ["cardinal-system/AGENTS.md", "AGENTS.md"],
    scope: "lite",
  },
};

const ManifestPresetSchema = z.object({
  description: z.string().max(300).optional(),
  skills: z.array(z.string().min(1).max(200)).max(32),
  conductCandidates: z.array(z.string().min(1).max(200)).max(10).optional(),
  scope: z.enum(["lite", "standard", "full"]).optional(),
  includeStarterFiles: z.boolean().optional(),
});

const ManifestSchema = z.object({
  presets: z.record(z.string().min(1).max(64), ManifestPresetSchema),
});

const MANIFEST_CANDIDATES = ["cardinal-system/bootstrap.md", "config/bootstrap.md"] as const;

const SKILL_PREFIX_CANDIDATES = ["skills", "for-my-agents/skills", "cardinal-system/skills"] as const;

export interface BootstrapOptions {
  preset?: string;
  project?: string;
  stack?: string;
  skills?: string[];
  extraSkills?: string[];
  includeStarterFiles?: boolean;
  /** Repo standards tier (`lite` | `standard` | `full`); defaults to the preset's tier. */
  repoScope?: RepoScope;
  hooks?: HookLevel | "auto";
  defaultBranch?: string;
  /** Caller key ACL scopes. */
  scopes: readonly string[];
  vaultStore: VaultStore;
  aclConfig?: AclConfig;
  maxBytes?: number;
}

export interface BootstrapPacket {
  preset: string;
  availablePresets: Record<string, { description: string; skills: string[] }>;
  markdown: string;
  standardsVersion: string;
  scope: RepoScope;
  hooks: HookLevel;
  complianceChecklist: string[];
  files: RepoStandardFile[];
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
  const budget = maxBytes > noticeBytes + 16 ? maxBytes - noticeBytes : Math.max(0, maxBytes);
  let end = budget;
  while (end > 0 && (buf[end]! & 0b1100_0000) === 0b1000_0000) {
    end -= 1;
  }
  const head = buf.subarray(0, end).toString("utf8");
  return {
    text: maxBytes > noticeBytes + 16 ? `${head.trimEnd()}${notice}` : head,
    truncated: true,
  };
}

async function loadEffectivePresets(
  scopes: readonly string[],
  vaultStore: VaultStore,
  aclConfig?: AclConfig,
): Promise<Record<string, BootstrapPresetConfig>> {
  const merged: Record<string, BootstrapPresetConfig> = {};
  for (const [key, val] of Object.entries(BUILTIN_BOOTSTRAP_PRESETS)) {
    merged[key] = { ...val, skills: [...val.skills], conductCandidates: [...val.conductCandidates] };
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
        if (!SLUG_RE.test(cleanName) || cleanName === "list") continue;
        const existing = merged[cleanName];
        merged[cleanName] = {
          description: spec.description ?? existing?.description ?? `Vault bootstrap preset "${cleanName}".`,
          skills: spec.skills,
          conductCandidates: spec.conductCandidates ?? existing?.conductCandidates ?? CONDUCT_CANDIDATES,
          scope: spec.scope ?? existing?.scope,
          includeStarterFiles: spec.includeStarterFiles ?? existing?.includeStarterFiles,
        };
      }
      break;
    } catch {
      // Optional vault manifest absent or invalid; keep built-in presets.
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

async function collectDiscoverableFiles(scopes: readonly string[], vaultStore: VaultStore): Promise<string[]> {
  const discovered = new Set<string>();
  for (const prefix of SKILL_PREFIX_CANDIDATES) {
    try {
      const list = await vaultStore.listEntries(scopes, { prefix, depth: 5 });
      for (const file of list.files) discovered.add(file.path);
    } catch {
      // Prefix unreadable for this key; skip.
    }
  }
  if (discovered.size === 0) {
    try {
      const list = await vaultStore.listEntries(scopes, { depth: 5 });
      for (const file of list.files) discovered.add(file.path);
    } catch {
      // Listing unavailable.
    }
  }
  return Array.from(discovered).sort();
}

function resolveSkillPath(
  requested: string,
  discoverableFiles: string[],
  scopes: readonly string[],
  aclConfig?: AclConfig,
): string | null {
  const trimmed = requested.trim();
  if (trimmed === "") return null;

  if (trimmed.includes("/")) {
    try {
      const clean = normalizeRelativePath(trimmed);
      return canReadPath(scopes, clean, aclConfig) ? clean : null;
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
  return bestPath !== null && canReadPath(scopes, bestPath, aclConfig) ? bestPath : null;
}

/** Resolves `a|b|c` to the first alternative present in the vault. */
function resolveSkillRequest(
  request: string,
  discoverableFiles: string[],
  scopes: readonly string[],
  aclConfig?: AclConfig,
): { slug: string; path: string } | null {
  for (const alternative of request.split("|").map((s) => s.trim()).filter(Boolean)) {
    const path = resolveSkillPath(alternative, discoverableFiles, scopes, aclConfig);
    if (path) return { slug: alternative, path };
  }
  return null;
}

function scopeGuideLines(selected?: RepoScope): string[] {
  return REPO_SCOPES.map(
    (s) => `- **\`${s}\`**${s === selected ? " (selected)" : ""}: ${SCOPE_GUIDE[s]}`,
  );
}

/**
 * Builds the deterministic, ACL-checked New-Repo Bootstrap packet ("Configuration 101"):
 * conduct rules, scope-tiered repo standards, and resolved vault workflow skills.
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
      throw new VaultError("invalid project slug (must match /^[a-z0-9][a-z0-9._-]{0,63}$/)");
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
    const repoScope = options.repoScope ?? "standard";
    const markdown = [
      "# Cardinal New-Repo Bootstrap Presets",
      "",
      "Call `cardinal_bootstrap_repo` with a preset (override skills with `skills` / `extra_skills`; `a|b` picks the first skill found).",
      "",
      ...Object.entries(availablePresets).map(
        ([name, meta]) =>
          `- **\`${name}\`** — ${meta.description}\n  - Skills: ${meta.skills.map((s) => `\`${s}\``).join(", ")}`,
      ),
      "",
      "## Scope tiers (`scope`)",
      "",
      ...scopeGuideLines(),
      "",
    ].join("\n");
    return {
      preset: "list",
      availablePresets,
      markdown,
      standardsVersion: REPO_STANDARDS_VERSION,
      scope: repoScope,
      hooks: resolveHookLevel(repoScope, options.hooks),
      complianceChecklist: [],
      files: [],
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

  const repoScope: RepoScope = options.repoScope ?? presetSpec.scope ?? "standard";
  const includeFiles = options.includeStarterFiles ?? presetSpec.includeStarterFiles ?? true;
  const blueprint = buildRepoStandardsBlueprint({
    project: projectSlug,
    stack: options.stack,
    scope: repoScope,
    hooks: options.hooks,
    defaultBranch: options.defaultBranch,
  });

  const requestedSkills =
    options.skills && options.skills.length > 0 ? options.skills : presetSpec.skills;
  const dedupedRequests: string[] = [];
  const seenRequests = new Set<string>();
  for (const item of [...requestedSkills, ...(options.extraSkills ?? [])]) {
    const clean = item.trim();
    const key = clean.toLowerCase();
    if (!clean || seenRequests.has(key)) continue;
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
  const includedSkills: BootstrapPacket["includedSkills"] = [];
  const missingSkills: string[] = [];
  const skillBlocks: string[] = [];
  const loadedPaths = new Set<string>();

  for (const request of dedupedRequests) {
    const resolved = resolveSkillRequest(request, discoverableFiles, scopes, aclConfig);
    if (!resolved) {
      missingSkills.push(request);
      continue;
    }
    if (loadedPaths.has(resolved.path)) continue;

    try {
      const doc = await vaultStore.readMarkdown(scopes, resolved.path, PER_SKILL_MAX_BYTES);
      loadedPaths.add(resolved.path);
      includedSkills.push({
        requested: resolved.slug,
        path: doc.path,
        bytes: doc.bytes,
        truncated: doc.truncated,
      });
      const note = doc.truncated
        ? `\n\n_[skill truncated at ${PER_SKILL_MAX_BYTES} bytes — call \`cardinal_read\` on \`${doc.path}\` for full text]_`
        : "";
      skillBlocks.push(`### Skill: \`${resolved.slug}\`\n_Source: \`${doc.path}\`_\n\n${doc.content.trim()}${note}`);
    } catch {
      missingSkills.push(request);
    }
  }

  const headerLines = [
    `# Cardinal New-Repo Bootstrap (preset: \`${requestedPreset}\`)`,
    "",
    "Baseline rules, repo standards, and portable workflow skills resolved from the Cardinal vault, with no client-side installs.",
    projectSlug ? `- **Project**: \`${projectSlug}\`` : null,
    options.stack?.trim() ? `- **Stack**: ${options.stack.trim().replace(/[\r\n]+/g, " ")}` : null,
    includeFiles
      ? `- **Scope**: \`${blueprint.scope}\` (hooks: \`${blueprint.hooks}\`): ${SCOPE_GUIDE[blueprint.scope]}`
      : null,
    `- **Included skills (${includedSkills.length})**: ${
      includedSkills.length > 0
        ? includedSkills.map((s) => `\`${s.requested}\` (\`${s.path}\`)`).join(", ")
        : "_none_"
    }`,
    missingSkills.length > 0
      ? `- **Missing or outside key scopes (${missingSkills.length})**: ${missingSkills.map((s) => `\`${s}\``).join(", ")}`
      : null,
  ].filter((line): line is string => line !== null);

  const sections: string[] = [headerLines.join("\n"), ...conductBlocks];
  if (includeFiles) {
    sections.push(renderRepoStandardsMarkdown(blueprint).trimEnd());
  }
  if (skillBlocks.length > 0) {
    sections.push(`## Loaded Workflow Skills\n\n${skillBlocks.join("\n\n---\n\n")}`);
  }

  const bounded = truncateUtf8(
    `${sections.join("\n\n")}\n`,
    maxBytes,
    "\n\n_[bootstrap packet truncated to fit maxBytes; use format: \"json\" for files or `cardinal_read` for skills]_\n",
  );

  return {
    preset: requestedPreset,
    availablePresets,
    markdown: bounded.text,
    standardsVersion: REPO_STANDARDS_VERSION,
    scope: blueprint.scope,
    hooks: blueprint.hooks,
    complianceChecklist: includeFiles ? blueprint.complianceChecklist : [],
    files: includeFiles ? blueprint.files : [],
    conductFiles,
    includedSkills,
    missingSkills,
    bytes: Buffer.byteLength(bounded.text, "utf8"),
    truncated: bounded.truncated,
  };
}
