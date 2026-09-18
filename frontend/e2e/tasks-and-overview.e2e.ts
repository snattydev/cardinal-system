import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Cardinal System — Tasks & Overview", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("authenticated user can create a task from the Tasks page", async ({ page }) => {
    const goal = `E2E task ${Date.now()}`;

    await page.goto("/tasks");
    await expect(page.getByText("TASKS", { exact: true })).toBeVisible();

    await page.getByPlaceholder("Define new task goal...").fill(goal);
    await page.getByRole("button", { name: "Create Task" }).click();

    const taskCard = page
      .locator("main")
      .getByText(goal)
      .locator("xpath=ancestor::*[contains(@class,'sao-panel') or contains(@class,'rounded')][1]");

    await expect(taskCard).toBeVisible();
    await expect(taskCard.getByText("open")).toBeVisible();
    await expect(taskCard.getByText(/by admin/)).toBeVisible();
  });

  test("overview page renders system metric cards with live data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("SYSTEM OVERVIEW")).toBeVisible();

    await expect(page.getByText("Agents Online")).toBeVisible();
    await expect(page.getByText("Keys Active")).toBeVisible();
    await expect(page.getByText("DB Size")).toBeVisible();
    await expect(page.getByText("Uptime")).toBeVisible();

    // Wait for /api/system to hydrate stat values (not the initial "—" placeholders).
    await expect(page.getByText("Agents Online").locator("+ span")).toHaveText(/\d+ \/ \d+/, {
      timeout: 10_000,
    });
    await expect(page.getByText("Keys Active").locator("+ span")).toHaveText(/^\d+$/, {
      timeout: 10_000,
    });
    await expect(page.getByText("DB Size").locator("+ span")).not.toHaveText("—", {
      timeout: 10_000,
    });
    await expect(page.getByText("Uptime").locator("+ span")).toHaveText(/\d+[smhd]/, {
      timeout: 10_000,
    });
  });
});
