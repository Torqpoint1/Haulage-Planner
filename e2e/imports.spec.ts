import { expect, test, type Page } from "@playwright/test";
import { expectNoOverflow } from "./helpers";

/** CSV imports for customers/sites and vehicles share the order import's wizard (spec 11). */

const csv = (name: string, lines: string[]) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(lines.join("\n")),
});

async function upload(page: Page, file: ReturnType<typeof csv>) {
  await expect(async () => {
    await page.getByLabel("Choose a CSV file").setInputFiles(file);
    await expect(page.getByRole("heading", { name: "Match your columns" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass();
}

const stat = (page: Page, label: string) => page.getByText(label, { exact: true }).locator("..");

const problemRow = (page: Page, n: number) =>
  page
    .getByRole("table", { name: "Rows that won't be imported" })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: String(n), exact: true }) });

test("customers and sites import from a CSV, adding sites to existing customers", async ({
  page,
}) => {
  await page.goto("/customers");
  await page.getByRole("link", { name: "Import CSV" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Import customers and sites" }),
  ).toBeVisible();

  await upload(
    page,
    csv("customers.csv", [
      "Company,Account,Site,Address,Postcode,Contact,Phone,Forklift",
      "Kingsway Interiors,KW77,Worcester showroom,Foregate St,WR1 2EY,Priya Shah,01905 000111,yes",
      "Kingsway Interiors,KW77,Unit 4,,GL1 2BB,,,no",
      "Hillside Builders,HB001,Cardiff depot,,CF10 1EP,,,",
      "Nowhere Ltd,NW1,,,not a postcode,,,",
      "Hillside Builders,HB001,Cardiff depot,,CF10 1EP,,,",
    ]),
  );
  await expect(page.getByLabel(/^Customer \*/)).toContainText("Company");
  await expect(page.getByLabel(/^Postcode \*/)).toContainText("Postcode");
  await page.getByRole("button", { name: "Check 5 rows" }).click();

  await expect(stat(page, "Sites to import")).toHaveText(/\D3$/);
  await expect(stat(page, "New customers")).toHaveText(/\D1$/);
  await expect(stat(page, "Problem rows")).toHaveText(/\D2$/);
  await expect(problemRow(page, 5)).toContainText("“not a postcode” isn't a UK postcode.");
  await expect(problemRow(page, 6)).toContainText("is listed twice for this customer");
  await expectNoOverflow(page);

  await page.getByRole("button", { name: "Import 3 sites, skip the rest" }).click();
  await expect(page.getByText("3 sites imported")).toBeVisible();

  await page.getByRole("link", { name: "View customers" }).click();
  await page.getByLabel("Search customers").fill("Kingsway");
  await page.getByRole("link", { name: "Kingsway Interiors" }).first().click();
  const sites = page.getByRole("table", { name: "Sites", exact: true });
  await expect(sites).toContainText("Worcester showroom");
  await expect(sites).toContainText("Unit 4");

  await page.goto("/customers");
  await page.getByLabel("Search customers").fill("Hillside");
  await page.getByRole("link", { name: "Hillside Builders" }).first().click();
  await expect(page.getByRole("table", { name: "Sites", exact: true })).toContainText(
    "Cardiff depot",
  );
});

test("vehicles import from a CSV, checked like the vehicle form", async ({ page }) => {
  await page.goto("/settings/vehicles");
  await page.getByRole("link", { name: "Import CSV" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Import vehicles" })).toBeVisible();

  const template = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download template" }).click();
  expect((await template).suggestedFilename()).toBe("vehicle-import-template.csv");

  await upload(
    page,
    csv("fleet.csv", [
      "Name,Reg,Type,Deck length,Deck width,Deck height,Payload,GVW,Overall length,Unloading,Tail lift max (kg)",
      `Import 7.5t,IM21 PRT,7.5 tonne,"6,100",2400,2300,2500,7500,8.2,"Tail lift, rear",750`,
      "Import van,IM70 VAN,van,3400,1750,1900,1200,3500,5.9,rear,",
      "Duplicate,WX21 KLM,18t,7300,2480,2500,9500,18000,9.8,side,",
      "Heavy van,IM71 HVY,van,3400,1750,1900,4000,3500,5.9,rear,",
    ]),
  );
  await page.getByRole("button", { name: "Check 4 rows" }).click();
  await expect(stat(page, "Vehicles to import")).toHaveText(/\D2$/);
  await expect(problemRow(page, 4)).toContainText("WX21 KLM is already in your fleet.");
  await expect(problemRow(page, 5)).toContainText("Gross weight can't be less than the payload.");
  await expectNoOverflow(page);

  await page.getByRole("button", { name: "Import 2 vehicles, skip the rest" }).click();
  await expect(page.getByText("2 vehicles imported")).toBeVisible();
  await page.getByRole("link", { name: "View vehicles" }).click();
  await expect(page.getByText("IM21 PRT").first()).toBeVisible();
  await expect(page.getByText("IM70 VAN").first()).toBeVisible();
});

test.describe("office staff", () => {
  test.use({ storageState: "e2e/.auth/office.json" });

  test("can't import customers or vehicles", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByRole("link", { name: "Import CSV" })).toHaveCount(0);
    await page.goto("/customers/import");
    await expect(page).toHaveURL(/no-access/);
    await page.goto("/settings/vehicles/import");
    await expect(page).toHaveURL(/no-access/);
  });
});
