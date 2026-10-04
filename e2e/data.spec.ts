import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectNoOverflow } from "./helpers";
import { sentEmails } from "./support/mail";

/** Spec 12 (UK GDPR): admins export everything and can request deletion. */

test("admins download all their organisation's data", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: /Your data/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your data" })).toBeVisible();
  await expectNoOverflow(page);

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download all data (JSON)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^example-doors-ltd-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));

  expect(data.organisation.name).toBe("Example Doors Ltd");
  const names = (rows: { name?: string }[]) => rows.map((r) => r.name);
  expect(names(data.tables.customers)).toContain("Hillside Builders");
  expect(data.tables.orders.map((o: { order_ref: string }) => o.order_ref)).toContain("SO-24101");
  expect(data.tables.pods.length).toBeGreaterThan(0);
  expect(
    data.tables.memberships.map((m: { profile: { email: string } }) => m.profile.email),
  ).toEqual(expect.arrayContaining([expect.stringContaining("@")]));
  // Only this organisation's rows.
  for (const [table, rows] of Object.entries(data.tables) as [
    string,
    { organisation_id: string }[],
  ][]) {
    for (const row of rows) expect(row.organisation_id, table).toBe(data.organisation.id);
  }
  for (const f of data.files) expect(f.url, f.path).toMatch(/^http/);

  // Privacy documents aren't written yet, and say so.
  await expect(page.getByRole("list", { name: "Privacy documents" })).toContainText(
    "Privacy noticeNot published yet",
  );
});

test("deletion is requested with a typed confirmation and can be cancelled", async ({ page }) => {
  await page.goto("/settings/data");
  await page.getByLabel(/Type Example Doors Ltd to confirm/).fill("Example Doors");
  await page.getByRole("button", { name: "Request deletion" }).click();
  await expect(page.getByText("Type Example Doors Ltd to confirm.")).toBeVisible();

  await page.getByLabel(/Type Example Doors Ltd to confirm/).fill("example doors ltd");
  await page.getByLabel(/Reason/).fill("Testing the request");
  await page.getByRole("button", { name: "Request deletion" }).click();
  const status = page.getByRole("status").filter({ hasText: "Deletion requested" });
  await expect(status).toContainText("will be deleted on or after");
  // Whoever runs the service hears about it.
  const emails = await sentEmails("operator@example.test");
  expect(emails.at(-1)!.subject).toBe("Deletion requested: Example Doors Ltd");
  expect(emails.at(-1)!.text).toContain("Reason: Testing the request");
  await expectNoOverflow(page);

  await page.getByRole("button", { name: "Cancel the deletion request" }).click();
  await expect(page.getByRole("button", { name: "Request deletion" })).toBeVisible();
});

test.describe("office staff", () => {
  test.use({ storageState: "e2e/.auth/office.json" });

  test("other roles can't export or reach the page", async ({ page }) => {
    const response = await page.request.get("/settings/data/export");
    expect(response.status()).toBe(403);
    await page.goto("/settings/data");
    await expect(page).toHaveURL(/no-access/);
  });
});
