import type { Page } from "@playwright/test";

/** Dev credentials from `.cursor/start.sh` / Cloud Agent `.env`. */
export const E2E_ADMIN_USER = process.env.E2E_ADMIN_USER ?? "admin";
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "cardinal-dev";

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill(E2E_ADMIN_USER);
  await page.getByPlaceholder("Password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: /Link Start/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}
