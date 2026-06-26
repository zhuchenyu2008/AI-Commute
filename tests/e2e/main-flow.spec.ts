import { test, expect } from "@playwright/test";

test("login, create an agent session, and open trip detail", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("ERR_NETWORK_ACCESS_DENIED")) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/login");
  await page.locator("input[type='password']").fill("change-me-now");
  await Promise.all([page.waitForURL("**/"), page.getByRole("button", { name: /杩涘叆|进入/ }).click()]);

  const prompt = page.locator("input").first();
  await expect(prompt).toBeVisible();
  await prompt.fill("明天 9:15 到龙湖天街");
  await prompt.press("Enter");

  await expect(page).toHaveURL(/\/agent\/sessions\//, { timeout: 15_000 });
  await expect(page.getByText("执行记录")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: /已创建行程/ }).click();

  await expect(page.getByText("和 Agent 聊这趟行程")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /和 Agent 聊这趟行程/ })).toBeVisible();

  expect(errors).toEqual([]);
});
