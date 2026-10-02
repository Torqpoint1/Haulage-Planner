import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Stage 4 "Done when": a 200-row CSV imports with clear error reporting, and
 * search finds orders by any reference. Seeded orders are SO-24101…SO-24105
 * (see seedOrders in e2e/support/accounts.ts).
 */

test.describe.configure({ mode: "serial" });

function field(scope: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope.getByLabel(new RegExp(`^${escaped}(\\s*\\*?\\s*\\(required\\))?$`));
}

async function choose(page: Page, scope: Page | Locator, label: string, option: string) {
  await field(scope, label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const ukDate = (daysAhead: number) => {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London" }).format(d);
};

test("search finds orders by ref, PO, delivery note, invoice, customer and postcode", async ({
  page,
}) => {
  await page.goto("/orders");
  const table = page.getByRole("table", { name: "Orders", exact: true });
  await expect(table.getByRole("link", { name: /^SO-241/ })).toHaveCount(5);

  const search = page.getByLabel("Search orders");
  const expectOnly = async (term: string, refs: string[]) => {
    await search.fill(term);
    await expect(page).toHaveURL(
      new RegExp(`q=${encodeURIComponent(term).replace(/%20/g, "\\+")}`),
    );
    await expect(table.getByRole("link", { name: /^SO-/ })).toHaveText(refs);
  };
  await expectOnly("SO-24103", ["SO-24103"]);
  await expectOnly("hb-po-7781", ["SO-24101"]);
  await expectOnly("DN-50212", ["SO-24103"]);
  await expectOnly("INV-90311", ["SO-24101"]);
  await expectOnly("Marlow", ["SO-24102"]);
  await expectOnly("OAK22", ["SO-24104"]);
  await expectOnly("NP20 4AA", ["SO-24103"]);
  await expectOnly("np204aa", ["SO-24103"]);

  await search.fill("nothing like this");
  await expect(page.getByRole("heading", { name: "No orders match" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(table.getByRole("link", { name: /^SO-241/ })).toHaveCount(5);

  // Readiness filter
  await choose(page, page, "Readiness", "Ready");
  await expect(table.getByRole("link", { name: /^SO-/ })).toHaveText(["SO-24101", "SO-24105"]);
});

test("export downloads the listed orders as CSV", async ({ page }) => {
  await page.goto("/orders");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain("Order ref,Customer");
  expect(text).toContain("SO-24101,Hillside Builders,HB001");
});

test("an order is created with lines, readiness updated, documents added and edited", async ({
  page,
}) => {
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.getByText("Choose the customer.")).toBeVisible();
  await expect(page.getByText("Add at least one line: what's being delivered.")).toBeVisible();

  await field(page, "Customer").click();
  await page.getByPlaceholder("Search name or account ref").fill("STM07");
  await page.getByRole("option", { name: /Severn Timber Merchants/ }).click();
  // Only one site, so it's chosen for you.
  await expect(field(page, "Delivery site")).toContainText("Newport depot");

  await field(page, "Order ref").fill("E2E-1001");
  await field(page, "Customer PO number").fill("STM-PO-9001");
  await field(page, "Required delivery date").fill(ukDate(5));
  await choose(page, page, "Unit type", "Euro pallet (EUR)");
  await expect(field(page, "Weight per unit")).toHaveValue("300");
  await field(page, "Quantity").fill("2");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByRole("button", { name: "Remove line 2" }).click();
  await expect(page.getByText("Total weight")).toContainText("600 kg");
  await page.getByRole("button", { name: "Create order" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "E2E-1001" })).toBeVisible();
  await expect(page.getByText("2 × Euro pallet")).toBeVisible();
  await expect(page.getByText("2 EUR")).toBeVisible();
  await expect(page.getByRole("link", { name: "Newport depot" })).toBeVisible();
  await expect(page.getByText("Booking needed.")).toBeVisible();

  // Readiness: part ready needs a date.
  await page.getByRole("button", { name: "Update readiness" }).click();
  await choose(page, page, "Readiness", "Part ready");
  await page.getByRole("button", { name: "Save readiness" }).click();
  await expect(page.getByText("Enter when it's expected to be ready.").last()).toBeVisible();
  await field(page, "Expected ready date").fill(ukDate(3));
  await field(page, "Missing items").fill("1 pallet of hinges");
  await page.getByRole("button", { name: "Save readiness" }).click();
  await expect(page.getByText("1 pallet of hinges").first()).toBeVisible();
  await expect(page.getByText("Readiness: Not started → Part ready")).toBeVisible();

  // Documents
  await page.getByLabel("Choose documents to add").setInputFiles({
    name: "delivery-note.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%test\n"),
  });
  await expect(page.getByRole("link", { name: "delivery-note.pdf" })).toBeVisible();
  await expect(page.getByText("Document added: delivery-note.pdf")).toBeVisible();
  await page.getByRole("button", { name: "Remove delivery-note.pdf" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("link", { name: "delivery-note.pdf" })).toHaveCount(0);
  await expect(page.getByText("Document removed: delivery-note.pdf")).toBeVisible();

  // Edit
  await page.getByRole("link", { name: "Edit order" }).click();
  await expect(field(page, "Order ref")).toHaveValue("E2E-1001");
  await field(page, "Order ref").fill("SO-24101");
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByText("Another order already has this ref.")).toBeVisible();
  await field(page, "Order ref").fill("E2E-1001");
  await field(page, "Customer PO number").fill("STM-PO-9002");
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E-1001" })).toBeVisible();
  await expect(page.getByText("Customer PO: “STM-PO-9001” → “STM-PO-9002”")).toBeVisible();

  // Cancel, then delete
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByText("Status: Unplanned → Cancelled")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete order" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.getByLabel("Search orders").fill("E2E-1001");
  await expect(page.getByRole("heading", { name: "No orders match" })).toBeVisible();
});

/**
 * 100 orders × 2 lines. Five orders are broken in different ways, so 10 rows
 * are rejected and 95 orders (190 lines) import.
 */
function importCsv() {
  const accounts = [
    ["HB001", "GL5 3QF"],
    ["MJ014", "GL1 2BB"],
    ["STM07", "NP20 4AA"],
    ["OAK22", "SN1 4DD"],
  ];
  const lines = ["Order No,Account,Delivery Postcode,PO,When,Unit,Qty,Description"];
  for (let i = 0; i < 100; i++) {
    const [account, postcode] = accounts[i % 4];
    let ref = `IMP-${1000 + i}`;
    let customer = account;
    let when = ukDate(7 + (i % 5));
    let unit2 = "UKP";
    let qty2 = "1";
    let unit1 = "EUR";
    if (i === 5) customer = "Nobody Ltd";
    if (i === 25) when = "31/02/2027";
    if (i === 45) unit1 = "XYZ";
    if (i === 65) qty2 = "0";
    if (i === 85) ref = "SO-24101";
    if (i === 95) unit2 = "Door pack";
    lines.push(`${ref},${customer},${postcode},PO-${i},${when},${unit1},2,"Pallet, mixed"`);
    lines.push(`${ref},${customer},${postcode},PO-${i},${when},${unit2},${qty2},`);
  }
  return lines.join("\n");
}

test("a 200-row CSV imports with row-by-row errors, and the column matches are remembered", async ({
  page,
}) => {
  const file = {
    name: "orders-export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(importCsv()),
  };
  await page.goto("/orders");
  await page.getByRole("link", { name: "Import CSV" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Import orders" })).toBeVisible();

  const template = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download template" }).click();
  expect((await template).suggestedFilename()).toBe("order-import-template.csv");

  await page.getByLabel("Choose a CSV file").setInputFiles(file);
  await expect(page.getByText("orders-export.csv has 200 rows.")).toBeVisible();
  // Guessed from the headers…
  await expect(field(page, "Order ref *")).toContainText("Order No");
  await expect(field(page, "Customer *")).toContainText("Account");
  await expect(field(page, "Quantity *")).toContainText("Qty");
  // …but "When" needs choosing.
  await expect(page.getByRole("button", { name: "Check 200 rows" })).toBeDisabled();
  await choose(page, page, "Required date *", "When");
  await page.getByRole("button", { name: "Check 200 rows" }).click();

  const stat = (label: string) => page.getByText(label, { exact: true }).locator("..");
  await expect(stat("Rows in file")).toHaveText(/200$/);
  await expect(stat("Orders to import")).toHaveText(/\D95$/);
  await expect(stat("Order lines")).toHaveText(/\D190$/);
  await expect(stat("Problem rows")).toHaveText(/\D10$/);
  await expect(page.getByText("10 rows won't be imported")).toBeVisible();

  const problems = page.getByRole("table", { name: "Rows that won't be imported" });
  const row = (n: number) =>
    problems
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: String(n), exact: true }) });
  await expect(row(12)).toContainText("No customer called “Nobody Ltd”");
  await expect(row(52)).toContainText("“31/02/2027” isn't a valid date");
  await expect(row(92)).toContainText("No unit type “XYZ”");
  await expect(row(93)).toContainText(
    "Not imported because row 92 of the same order has a problem.",
  );
  await expect(row(133)).toContainText("Quantity “0” must be a whole number");
  await expect(row(172)).toContainText("Order SO-24101 already exists.");

  const rejectedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download problem rows" }).click();
  const rejectedText = await readFile((await (await rejectedDownload).path())!, "utf8");
  const rejectedLines = rejectedText.trim().split(/\r\n/);
  expect(rejectedLines[0]).toContain("Problem");
  expect(rejectedLines).toHaveLength(11);

  await page.getByRole("button", { name: "Import 95 orders, skip the rest" }).click();
  await expect(page.getByText("95 orders imported")).toBeVisible();
  await expect(page.getByText("10 rows weren't imported.")).toBeVisible();

  // The imported orders are searchable, lines intact.
  await page.getByRole("link", { name: "View orders" }).click();
  await page.getByLabel("Search orders").fill("IMP-1095");
  const table = page.getByRole("table", { name: "Orders", exact: true });
  await expect(table.getByRole("link", { name: /^IMP-/ })).toHaveText(["IMP-1095"]);
  await expect(table).toContainText("2 EUR · 1 DP");
  await page.getByLabel("Search orders").fill("PO-17");
  await expect(table.getByRole("link", { name: /^IMP-/ })).toHaveText(["IMP-1017"]);

  // Next time, the same file's columns are matched straight away, "When" included.
  await page.goto("/orders/import");
  await page.getByLabel("Choose a CSV file").setInputFiles(file);
  await expect(page.getByText("We've used the matches from your last import")).toBeVisible();
  await expect(field(page, "Required date *")).toContainText("When");
  await page.getByRole("button", { name: "Check 200 rows" }).click();
  // Everything valid is already in, so every row is now a duplicate or a problem.
  await expect(page.getByText("Orders to import", { exact: true }).locator("..")).toHaveText(
    /\D0$/,
  );
  await expect(page.getByText("Order IMP-1000 already exists.").first()).toBeVisible();
});

test("a file with no usable rows says so plainly", async ({ page }) => {
  await page.goto("/orders/import");
  await page.getByLabel("Choose a CSV file").setInputFiles({
    name: "empty.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Order No,Account\n"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "file" })).toContainText(
    "That file has a header row but no orders under it.",
  );
  await page.getByLabel("Choose a CSV file").setInputFiles({
    name: "orders.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("PK"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "file" })).toContainText(
    "Choose a CSV file.",
  );
});

test.describe("office staff", () => {
  test.use({ storageState: "e2e/.auth/office.json" });

  test("can find and read orders but not change them", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByRole("link", { name: "SO-24101" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New order" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Import CSV" })).toHaveCount(0);
    await page.getByRole("link", { name: "SO-24102" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "SO-24102" })).toBeVisible();
    await expect(page.getByText("2 door frames")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit order" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Update readiness" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add document" })).toHaveCount(0);
    await page.goto("/orders/new");
    await expect(page).toHaveURL(/no-access/);
  });
});
