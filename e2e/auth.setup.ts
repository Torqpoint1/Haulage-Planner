import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as setup, type Page } from "@playwright/test";
import { PASSWORD, createCompany } from "./support/accounts";

export const AUTH_DIR = "e2e/.auth";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeAttached();
}

/** One company per run, signed in once per role and reused by the other tests. */
setup("create the demo company and sign in", async ({ page, browser }) => {
  mkdirSync(AUTH_DIR, { recursive: true });
  const company = await createCompany("Example Doors Ltd", "Sam Patel", [
    { name: "Olivia Office", role: "office" },
    { name: "Will Warehouse", role: "warehouse" },
    { name: "Dan Driver", role: "driver" },
  ]);
  writeFileSync(`${AUTH_DIR}/company.json`, JSON.stringify(company, null, 2));

  await signIn(page, company.adminEmail);
  await expect(page).toHaveURL(/\/today$/);
  await page.context().storageState({ path: `${AUTH_DIR}/admin.json` });

  for (const role of ["office", "warehouse", "driver"] as const) {
    const context = await browser.newContext();
    const rolePage = await context.newPage();
    await signIn(rolePage, company.members[role]);
    await context.storageState({ path: `${AUTH_DIR}/${role}.json` });
    await context.close();
  }
});
