import { test, expect } from "@playwright/test";

test.describe("Cardinal System — UI Automated Tests", () => {
  test("login page renders with SAO design system elements", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveTitle(/Cardinal System/);
    await expect(page.getByText("CARDINAL")).toBeVisible();
    await expect(page.getByText("System Authentication")).toBeVisible();

    const usernameInput = page.getByPlaceholder("Username");
    const passwordInput = page.getByPlaceholder("Password");
    const submitBtn = page.getByRole("button", { name: /Link Start/i });

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
  });

  test("login page rejects invalid credentials gracefully", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("Username").fill("invalid_user");
    await page.getByPlaceholder("Password").fill("wrong_password_123");
    await page.getByRole("button", { name: /Link Start/i }).click();

    const errorBanner = page.getByText("Invalid credentials");
    await expect(errorBanner).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated access redirects to /login", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/keys");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/router");
    await expect(page).toHaveURL(/\/login/);
  });
});
