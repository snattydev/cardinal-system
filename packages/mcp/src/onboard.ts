import { canReadPath, type AclConfig } from "./acl";
import { VaultError, type VaultStore } from "./vaults";
import { SLUG_RE } from "./writer";

export const DEFAULT_ONBOARD_MAX_BYTES = 24_000;

export type OnboardMode = "coding" | "hermes";

export interface OnboardOptions {
  mode: OnboardMode;
  project?: string;
  scopes: readonly string[];
  vaultStore: VaultStore;
  aclConfig?: AclConfig;
  maxBytes?: number;
}

export interface OnboardPacket {
  mode: OnboardMode;
  markdown: string;
  includedFiles: string[];
  missingOptional: string[];
  topicCount: number;
  bytes: number;
}

interface SectionSpec {
  title: string;
  candidates: string[];
}

function sectionsForMode(mode: OnboardMode, project?: string): SectionSpec[] {
  const common: SectionSpec[] = [
    {
      title: "Conduct Rules",
      candidates: ["cardinal-system/AGENTS.md", "AGENTS.md", "rules/CONDUCT.md"],
    },
    {
      title: "Command Output Discipline (rtk)",
      candidates: ["cardinal-system/RTK.md", "config/rtk.md"],
    },
  ];

  if (mode === "hermes") {
    return [
      ...common,
      {
        title: "Hermes Context",
        candidates: ["cardinal-system/HERMES.md", "config/setup/HERMES.md"],
      },
      {
        title: "Active Projects",
        candidates: ["projects/ACTIVE.md", "user/projects/ACTIVE.md"],
      },
    ];
  }

  const coding: SectionSpec[] = [
    ...common,
    {
      title: "Coding Context",
      candidates: ["cardinal-system/CODING.md", "config/setup/CODING.md"],
    },
    {
      title: "User Context",
      candidates: ["cardinal-system/USER.md", "user/USER.md"],
    },
    {
      title: "Active Projects",
      candidates: ["projects/ACTIVE.md", "user/projects/ACTIVE.md"],
    },
  ];

  if (project) {
    coding.push({
      title: `Project Handoff (${project})`,
      candidates: [`agents/handoffs/${project}.md`],
    });
  }

  return coding;
}

export async function buildOnboardPacket(options: OnboardOptions): Promise<OnboardPacket> {
  const { mode, scopes, vaultStore, aclConfig } = options;
  const maxBytes = options.maxBytes ?? DEFAULT_ONBOARD_MAX_BYTES;

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

  const listing = await vaultStore.listEntries(scopes, { depth: 2 });
  const topicLines: string[] = [];
  for (const dir of listing.directories) {
    topicLines.push(`- \`${dir.path}/\` (${dir.fileCount} notes)`);
  }
  for (const file of listing.files) {
    topicLines.push(`- \`${file.path}\``);
  }

  const topicMapBlock =
    topicLines.length > 0
      ? topicLines.join("\n")
      : "_No readable vault topics for the active key scopes._";

  const includedFiles: string[] = [];
  const missingOptional: string[] = [];
  const sectionBlocks: string[] = [];

  for (const spec of sectionsForMode(mode, projectSlug)) {
    let loaded: { path: string; content: string } | null = null;
    for (const candidate of spec.candidates) {
      if (!canReadPath(scopes, candidate, aclConfig)) continue;
      try {
        const res = await vaultStore.readMarkdown(scopes, candidate, 8_192);
        loaded = { path: res.path, content: res.content.trim() };
        break;
      } catch {
        // Optional document absent; try next fallback candidate.
      }
    }

    if (loaded !== null) {
      includedFiles.push(loaded.path);
      sectionBlocks.push(`## ${spec.title}\n_Source: \`${loaded.path}\`_\n\n${loaded.content}`);
    } else {
      missingOptional.push(spec.candidates[0]!);
    }
  }

  const header = [
    `# Cardinal Onboarding (${mode})`,
    "",
    "Deterministic context packet. Use `cardinal_list`, `cardinal_search`, and `cardinal_read` to inspect specific notes on demand.",
    "",
    "## Readable Topic Map",
    topicMapBlock,
  ].join("\n");

  const rawMarkdown = [header, ...sectionBlocks].join("\n\n") + "\n";
  const truncationNotice = "\n\n_[truncated to fit context budget]_\n";
  const noticeBytes = Buffer.byteLength(truncationNotice, "utf8");

  let markdown = rawMarkdown;
  if (Buffer.byteLength(rawMarkdown, "utf8") > maxBytes) {
    const buf = Buffer.from(rawMarkdown, "utf8");
    if (maxBytes > noticeBytes + 16) {
      let end = maxBytes - noticeBytes;
      while (end > 0 && (buf[end]! & 0b1100_0000) === 0b1000_0000) {
        end -= 1;
      }
      markdown = `${buf.subarray(0, end).toString("utf8").trimEnd()}${truncationNotice}`;
    } else {
      let end = Math.max(0, maxBytes);
      while (end > 0 && (buf[end]! & 0b1100_0000) === 0b1000_0000) {
        end -= 1;
      }
      markdown = buf.subarray(0, end).toString("utf8");
    }
  }

  return {
    mode,
    markdown,
    includedFiles,
    missingOptional,
    topicCount: listing.directories.length + listing.files.length,
    bytes: Buffer.byteLength(markdown, "utf8"),
  };
}
