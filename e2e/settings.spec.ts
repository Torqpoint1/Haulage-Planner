import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Stage 2 "Done when": every setting can be created, edited and deleted with
 * validation, and the accent colour applies app-wide. Runs as the admin of
 * the demo company, which the setup project seeds with realistic settings.
 */

// These share one company, so run them one after another.
test.describe.configure({ mode: "serial" });

/** A form control by its label, allowing for the "(required)" suffix. */
function field(scope: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope.getByLabel(new RegExp(`^${escaped}(\\s*\\*?\\s*\\(required\\))?$`));
}

function list(page: Page, label: string) {
  return page.getByRole("table", { name: label, exact: true });
}

async function openAdd(page: Page, path: string, singular: string) {
  await page.goto(path);
  await page
    .getByRole("button", { name: `Add ${singular}` })
    .first()
    .click();
  return page.getByRole("dialog", { name: `Add ${singular}` });
}

async function save(page: Page, singular: string) {
  await page.getByRole("button", { name: `Save ${singular}` }).click();
}

async function choose(page: Page, scope: Locator, label: string, option: string | RegExp) {
  await field(scope, label).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

async function deleteRow(page: Page, row: Locator, name: string) {
  await row.getByRole("button", { name: `Delete ${name}` }).click();
  await page
    .getByRole("dialog", { name: `Delete ${name}?` })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText(`${name} deleted`)).toBeVisible();
}

test("settings index links to every built section", async ({ page }) => {
  await page.goto("/settings");
  for (const name of [
    "Organisation & branding",
    "Depots",
    "Users & roles",
    "Handling unit types",
    "Vehicles",
    "Drivers",
    "Hauliers & rate cards",
    "Postcode zones",
    "Warning thresholds",
  ]) {
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  }
});

test("unit types: validation keeps typed values, duplicates are explained, edit and delete", async ({
  page,
}) => {
  const panel = await openAdd(page, "/settings/unit-types", "unit type");
  await field(panel, "Name").fill("Glass stillage");
  await field(panel, "Short code").fill("gs");
  await field(panel, "Length").fill("1800");
  await field(panel, "Width").fill("wide");
  await save(page, "unit type");
  await expect(panel.getByText("Enter width as a number.")).toBeVisible();
  await expect(field(panel, "Name")).toHaveValue("Glass stillage");

  await field(panel, "Width").fill("900");
  await field(panel, "Height").fill("2000");
  await field(panel, "Typical weight").fill("250");
  await panel.getByRole("switch", { name: "Returnable asset" }).click();
  await panel.getByRole("switch", { name: "Fragile" }).click();
  await save(page, "unit type");
  await expect(page.getByText("Unit type saved")).toBeVisible();
  const row = list(page, "Handling unit types").getByRole("row", { name: /Glass stillage/ });
  await expect(row).toContainText("1,800 × 900 × 2,000 mm");
  await expect(row).toContainText("Returnable");
  await expect(row).toContainText("Fragile");

  const again = await openAdd(page, "/settings/unit-types", "unit type");
  await field(again, "Name").fill("Another stillage");
  await field(again, "Short code").fill("GS");
  for (const label of ["Length", "Width", "Height"]) await field(again, label).fill("1");
  await save(page, "unit type");
  await expect(again.getByText("Another unit type uses this short code.")).toBeVisible();
  await page.keyboard.press("Escape");

  await row.getByRole("button", { name: "Edit Glass stillage" }).click();
  await field(page.getByRole("dialog"), "Typical weight").fill("275");
  await save(page, "unit type");
  await expect(row).toContainText("275 kg");

  await deleteRow(page, row, "Glass stillage");
});

test("depots: postcode and opening hours are checked, one default at a time", async ({ page }) => {
  const panel = await openAdd(page, "/settings/depots", "depot");
  await field(panel, "Name").fill("Newport warehouse");
  await field(panel, "Postcode").fill("NP20");
  await panel.getByLabel("Saturday opens").fill("12:00");
  await save(page, "depot");
  await expect(panel.getByText("Enter a full UK postcode, e.g. GL5 3AA.")).toBeVisible();
  await expect(panel.getByText(/Enter both times for Saturday/)).toBeVisible();

  await field(panel, "Postcode").fill("np204aa");
  await panel.getByLabel("Saturday closes").fill("16:00");
  await panel.getByRole("switch", { name: "Default depot" }).click();
  await save(page, "depot");
  await expect(page.getByText("Depot saved")).toBeVisible();

  const table = list(page, "Depots");
  const row = table.getByRole("row", { name: /Newport warehouse/ });
  await expect(row).toContainText("NP20 4AA");
  await expect(row).toContainText("Mon–Fri 07:00–17:00; Sat 12:00–16:00");
  await expect(row).toContainText("Default");
  // The previous default gave way.
  await expect(table.getByRole("row", { name: /Stroud factory/ })).not.toContainText("Default");

  await row.getByRole("button", { name: "Edit Newport warehouse" }).click();
  await page.getByRole("dialog").getByRole("switch", { name: "Default depot" }).click();
  await save(page, "depot");
  await expect(row).not.toContainText("Default");
  await deleteRow(page, row, "Newport warehouse");
});

test("vehicles: weights, equipment limits and the capacity matrix", async ({ page }) => {
  const panel = await openAdd(page, "/settings/vehicles", "vehicle");
  await field(panel, "Name").fill("Van 2");
  await field(panel, "Registration").fill("cd22  efg");
  await choose(page, panel, "Type", "Van");
  await field(panel, "Deck length").fill("3000");
  await field(panel, "Deck width").fill("1700");
  await field(panel, "Deck height").fill("1800");
  await field(panel, "Payload").fill("1200");
  await field(panel, "Gross weight").fill("1000");
  await field(panel, "Overall length").fill("5.9");
  await field(panel, "Tail lift maximum").fill("");
  await panel.getByRole("checkbox", { name: "Tail lift" }).click();
  await field(panel, "Cost per mile").fill("0.48");
  await field(panel, "Cost per driver hour").fill("15");
  await save(page, "vehicle");
  await expect(panel.getByText("Gross weight can't be less than the payload.")).toBeVisible();
  await expect(panel.getByText("Enter the tail lift's maximum lift.")).toBeVisible();

  await field(panel, "Gross weight").fill("3500");
  await field(panel, "Tail lift maximum").fill("500");
  await field(panel, "Euro pallet").fill("2");
  await field(panel, "Door pack").fill("3");
  await save(page, "vehicle");
  await expect(page.getByText("Vehicle saved")).toBeVisible();

  const row = list(page, "Vehicles").getByRole("row", { name: /Van 2/ });
  await expect(row).toContainText("CD22 EFG");
  await expect(row).toContainText("1,200 kg");
  await expect(row).toContainText("3 DP · 2 EUR");
  await expect(row).toContainText("Available");

  // Registrations are unique.
  const dup = await openAdd(page, "/settings/vehicles", "vehicle");
  await field(dup, "Name").fill("Copy");
  await field(dup, "Registration").fill("CD22 EFG");
  await choose(page, dup, "Type", "Van");
  for (const [label, value] of [
    ["Deck length", "1"],
    ["Deck width", "1"],
    ["Deck height", "1"],
    ["Payload", "1"],
    ["Gross weight", "1"],
    ["Overall length", "1"],
    ["Cost per mile", "0"],
    ["Cost per driver hour", "0"],
  ]) {
    await field(dup, label).fill(value);
  }
  await save(page, "vehicle");
  await expect(dup.getByText("Another vehicle has this registration.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Taking it off road shows in the list; clearing a capacity removes it.
  await row.getByRole("button", { name: "Edit Van 2" }).click();
  const edit = page.getByRole("dialog");
  await field(edit, "Door pack").fill("");
  await edit.getByRole("textbox", { name: "From", exact: true }).fill("01/01/2026");
  await edit.getByRole("textbox", { name: "From", exact: true }).press("Tab");
  await save(page, "vehicle");
  await expect(row).toContainText("2 EUR");
  await expect(row).not.toContainText("DP");
  await expect(row).toContainText("Off road");

  await deleteRow(page, row, "Van 2");
});

test("drivers: licences, working days and a linked login", async ({ page }) => {
  const panel = await openAdd(page, "/settings/drivers", "driver");
  await field(panel, "Phone").fill("phone me");
  await save(page, "driver");
  await expect(panel.getByText("Enter the driver's name.")).toBeVisible();
  await expect(panel.getByText("Use digits, spaces and + ( ) - only.")).toBeVisible();

  await field(panel, "Name").fill("Dan Driver");
  await field(panel, "Phone").fill("07700 900789");
  await panel.getByRole("checkbox", { name: "C1 (up to 7.5t)" }).click();
  await panel.getByRole("checkbox", { name: "Saturday" }).click();
  await choose(page, panel, "Linked login", /^Dan Driver/);
  await save(page, "driver");
  await expect(page.getByText("Driver saved")).toBeVisible();

  const row = list(page, "Drivers").getByRole("row", { name: /Dan Driver/ });
  await expect(row).toContainText("C1");
  await expect(row).toContainText("Mon, Tue, Wed, Thu, Fri, Sat");
  await expect(row).toContainText("Login linked");
  await deleteRow(page, row, "Dan Driver");
});

test("postcode zones: areas are validated and can't overlap", async ({ page }) => {
  const panel = await openAdd(page, "/settings/zones", "zone");
  await field(panel, "Name").fill("Oxford & Swindon");
  await field(panel, "Postcode areas").fill("ox sn5");
  await save(page, "zone");
  await expect(panel.getByText(/SN5 isn't a postcode area/)).toBeVisible();

  await field(panel, "Postcode areas").fill("ox sn gl");
  await save(page, "zone");
  await expect(
    panel.getByText("Already in another zone: GL (in Gloucestershire). Remove them there first."),
  ).toBeVisible();

  await field(panel, "Postcode areas").fill("ox, sn");
  await panel.getByRole("radio", { name: "Teal" }).click();
  await save(page, "zone");
  const row = list(page, "Postcode zones").getByRole("row", { name: /Oxford & Swindon/ });
  await expect(row).toContainText("OX");
  await expect(row).toContainText("SN");
  await deleteRow(page, row, "Oxford & Swindon");
});

test("hauliers and rate cards: prices per zone, validity and surcharges", async ({ page }) => {
  const panel = await openAdd(page, "/settings/hauliers", "haulier");
  await field(panel, "Name").fill("Valley Freight");
  await field(panel, "Email").fill("not-an-email");
  await save(page, "haulier");
  await expect(panel.getByText("Enter a valid email address.")).toBeVisible();
  await field(panel, "Email").fill("ops@valley-freight.example");
  await field(panel, "Postcode areas covered").fill("cf np");
  await panel.getByRole("checkbox", { name: "Timed delivery" }).click();
  await choose(page, panel, "Your rating", "4 out of 5");
  await save(page, "haulier");
  await expect(page.getByText("Haulier saved")).toBeVisible();

  await list(page, "Hauliers").getByRole("link", { name: "Valley Freight" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Valley Freight" })).toBeVisible();
  await expect(page.getByText("Timed delivery")).toBeVisible();

  await page.getByRole("button", { name: "Add rate card" }).first().click();
  const card = page.getByRole("dialog", { name: "Add rate card" });
  await field(card, "Name").fill("Summer tariff");
  await field(card, "Valid from").fill("01/04/2026");
  await field(card, "Valid to").fill("01/03/2026");
  await field(card, "Valid to").press("Tab");
  await card.getByLabel("South Wales: Full pallet").fill("forty");
  await save(page, "rate card");
  await expect(card.getByText("The end date must be on or after the start date.")).toBeVisible();
  await expect(card.getByText("Enter a price in pounds, e.g. 42.50.")).toBeVisible();

  await field(card, "Valid to").fill("");
  await field(card, "Valid to").press("Tab");
  await card.getByLabel("South Wales: Full pallet").fill("£44.00");
  await card.getByLabel("South Wales: Full load").fill("420");
  await field(card, "Timed delivery").fill("18");
  await field(card, "Remote area postcodes").fill("sa62, sa72");
  await save(page, "rate card");
  await expect(page.getByText("Rate card saved")).toBeVisible();

  const row = list(page, "Rate cards").getByRole("row", { name: /Summer tariff/ });
  await expect(row).toContainText("01/04/2026 – no end date");
  await expect(row).toContainText("Current");
  await expect(row).toContainText("1 of 3");

  await row.getByRole("button", { name: "Edit Summer tariff" }).click();
  const edit = page.getByRole("dialog");
  await expect(edit.getByLabel("South Wales: Full pallet")).toHaveValue("44.00");
  await expect(field(edit, "Remote area postcodes")).toHaveValue("SA62, SA72");
  await edit.getByLabel("Midlands: Half pallet").fill("39");
  await save(page, "rate card");
  await expect(row).toContainText("2 of 3");

  await deleteRow(page, row, "Summer tariff");
  await page.getByRole("link", { name: "Hauliers & rate cards" }).click();
  await deleteRow(
    page,
    list(page, "Hauliers").getByRole("row", { name: /Valley Freight/ }),
    "Valley Freight",
  );
});

test("warning thresholds are validated, saved and can be reset", async ({ page }) => {
  await page.goto("/settings/thresholds");
  await field(page, "Near capacity").fill("120");
  await field(page, "Fill the gaps within").fill("15");
  await page.getByRole("button", { name: "Save thresholds" }).click();
  await expect(page.getByText("Near capacity must be 100% or less.")).toBeVisible();
  await field(page, "Near capacity").fill("85");
  await page.getByRole("button", { name: "Save thresholds" }).click();
  await expect(page.getByText("Thresholds saved")).toBeVisible();

  await page.reload();
  await expect(field(page, "Near capacity")).toHaveValue("85");
  await expect(field(page, "Fill the gaps within")).toHaveValue("15");

  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(field(page, "Near capacity")).toHaveValue("90");
  await page.getByRole("button", { name: "Save thresholds" }).click();
  await expect(page.getByText("Thresholds saved")).toBeVisible();
});

test("branding: the accent colour applies app-wide and a logo can be uploaded", async ({
  page,
}) => {
  const accent = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    );

  await page.goto("/settings/organisation");
  await page.getByRole("radio", { name: "Teal" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Organisation saved")).toBeVisible();

  // Every screen picks it up, including after a fresh load.
  await page.goto("/orders");
  expect(await accent()).toBe("#0f766e");

  // A colour that would be unreadable is adjusted automatically.
  await page.goto("/settings/organisation");
  await field(page, "Colour code").fill("#facc15");
  await expect(page.getByText(/Shown slightly darker in light mode/)).toBeVisible();
  await field(page, "Colour code").fill("purple");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Choose a colour, or enter one like #1d4ed8.")).toBeVisible();

  // A 1×1 PNG.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await page
    .getByLabel("Choose a logo image")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Logo updated")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true })
      .getByAltText("Example Doors Ltd logo"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Logo removed")).toBeVisible();

  // Put the default back for the other tests and screenshots.
  await page.goto("/settings/organisation");
  await page.getByRole("radio", { name: "Deep blue" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Organisation saved")).toBeVisible();
});
