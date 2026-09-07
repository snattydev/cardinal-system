import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = join(import.meta.dir, "bootstrap-admin-password.sh");

describe("bootstrap-admin-password.sh", () => {
  let tmpDir: string;
  let targetFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cardinal-bootstrap-test-"));
    targetFile = join(tmpDir, ".env");
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("writes argon2id hash to fresh file and verifies with Bun.password.verify", async () => {
    const password = "super-secret-password-123";
    const proc = Bun.spawn(["bash", SCRIPT_PATH, "--target", targetFile, "--non-interactive"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(password + "\n");
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    expect(existsSync(targetFile)).toBe(true);
    const content = readFileSync(targetFile, "utf-8");
    const match = content.match(/^ADMIN_PASSWORD_HASH=(.+)$/m);
    expect(match).not.toBeNull();
    const hash = match![1]!.trim();
    expect(hash.startsWith("$argon2id$")).toBe(true);

    const isValid = await Bun.password.verify(password, hash);
    expect(isValid).toBe(true);

    const isWrongValid = await Bun.password.verify("wrong-password", hash);
    expect(isWrongValid).toBe(false);
  });

  test("updates existing ADMIN_PASSWORD_HASH without disturbing other variables", async () => {
    writeFileSync(
      targetFile,
      "ADMIN_USER=admin\nADMIN_PASSWORD_HASH=old-dummy-hash\nJWT_SECRET=supersecretjwt\nPORT=8787\n",
    );

    const newPassword = "another-strong-password-456";
    const proc = Bun.spawn(["bash", SCRIPT_PATH, "--target", targetFile, "--non-interactive"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(newPassword + "\n");
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const content = readFileSync(targetFile, "utf-8");
    expect(content).toContain("ADMIN_USER=admin");
    expect(content).toContain("JWT_SECRET=supersecretjwt");
    expect(content).toContain("PORT=8787");
    expect(content).not.toContain("old-dummy-hash");

    const match = content.match(/^ADMIN_PASSWORD_HASH=(.+)$/m);
    expect(match).not.toBeNull();
    const hash = match![1]!.trim();
    const isValid = await Bun.password.verify(newPassword, hash);
    expect(isValid).toBe(true);
  });

  test("rejects password shorter than 8 characters", async () => {
    const proc = Bun.spawn(["bash", SCRIPT_PATH, "--target", targetFile, "--non-interactive"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write("short\n");
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("at least 8 characters");
  });

  test("rejects empty password", async () => {
    const proc = Bun.spawn(["bash", SCRIPT_PATH, "--target", targetFile, "--non-interactive"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write("\n");
    proc.stdin.end();

    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("cannot be empty");
  });
});
