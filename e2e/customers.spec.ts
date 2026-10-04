import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Stage 3 "Done when": site restrictions are fully captured, a postcode places
 * a correct pin, and stale site information is shown. Postcode lookups go to
 * the stand-in service in e2e/support/mock-postcodes.mjs.
 */

test.describe.configure({ mode: "serial" });

function field(scope: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope.getByLabel(new RegExp(`^${escaped}(\\s*\\*?\\s*\\(required\\))?$`));
}

async function choose(page: Page, scope: Locator, label: string, option: string) {
  await field(scope, label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** The draggable pin's title reads "<label>: <lat>, <lng>". */
function pin(page: Page) {
  return page.locator(".map-edit-pin");
}

async function pinPosition(page: Page) {
  const title = await pin(page).getAttribute("title");
  const [, lat, lng] = /: (-?[\d.]+), (-?[\d.]+)$/.exec(title ?? "") ?? [];
  return { lat: Number(lat), lng: Number(lng) };
}

test("customers list: search by name, account ref or postcode, and stale sites are flagged", async ({
  page,
}) => {
  await page.goto("/customers");
  const table = page.getByRole("table", { name: "Customers", exact: true });
  await expect(table.getByRole("row", { name: /Marlow Joinery/ })).toContainText("1 site to check");
  await expect(table.getByRole("row", { name: /Hillside Builders/ })).toContainText("Up to date");

  const search = page.getByLabel("Search customers");
  await search.fill("NP20");
  await expect(table.getByRole("link")).toHaveText(["Severn Timber Merchants"]);
  await search.fill("oak22");
  await expect(table.getByRole("link")).toHaveText(["Oakfield Homes"]);
  await search.fill("nobody here");
  await expect(page.getByText("No customers match")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(table.getByRole("link")).toHaveCount(6);
});

test("a new customer's site captures every restriction and its postcode places the correct pin", async ({
  page,
}) => {
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add customer" }).first().click();
  const panel = page.getByRole("dialog", { name: "Add customer" });
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(panel.getByText("Enter the customer's name.")).toBeVisible();
  await field(panel, "Name").fill("Cardiff Bay Interiors");
  await field(panel, "Account ref").fill("CBI03");
  await field(panel, "Default delivery instructions").fill("Report to reception on arrival.");
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(page.getByText("Customer saved")).toBeVisible();

  await page.getByRole("link", { name: "Cardiff Bay Interiors" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Cardiff Bay Interiors" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add site" }).first().click();
  const site = page.getByRole("dialog", { name: "Add site" });

  // The customer's default instructions are offered for the new site.
  await expect(field(site, "Delivery instructions")).toHaveValue("Report to reception on arrival.");

  await field(site, "Site name").fill("Showroom");
  await field(site, "Postcode").fill("CF10");
  await site.getByRole("switch", { name: "Handballing allowed" }).click();
  await site.getByRole("switch", { name: "Booking required" }).click();
  await page.getByRole("button", { name: "Save site" }).click();
  await expect(site.getByText("Enter a full UK postcode, e.g. GL5 3AA.")).toBeVisible();
  await expect(site.getByText("Say how many people are needed to handball.")).toBeVisible();
  await expect(site.getByText("Say how to book, or how much notice they need.")).toBeVisible();

  await field(site, "Postcode").fill("cf101ep");
  await choose(page, site, "Largest vehicle allowed", "7.5 tonne");
  await field(site, "Maximum vehicle length").fill("10");
  await field(site, "Maximum vehicle weight").fill("7500");
  await field(site, "Height restriction").fill("3.8");
  await site.getByRole("switch", { name: "No HGVs" }).click();
  await field(site, "Narrow access").fill("Tight turn into the loading bay");
  await field(site, "Parking").fill("Unload in bay 2 only");
  await site.getByRole("checkbox", { name: "Pump truck" }).click();
  await field(site, "People needed to handball").fill("2");
  await site.getByRole("switch", { name: "Crane drop allowed" }).click();
  await field(site, "Notice needed").fill("48");
  await field(site, "How to book").fill("Phone goods-in");
  await site.getByLabel("Monday opens").fill("08:00");
  await site.getByLabel("Monday closes").fill("17:00");
  await site.getByLabel("Monday window starts").fill("09:00");
  await site.getByLabel("Monday window ends").fill("11:00");
  await site.getByRole("switch", { name: "PPE required" }).click();
  await site.getByRole("switch", { name: "Site induction required" }).click();
  await site.getByRole("switch", { name: "Site contact must be present" }).click();
  await page.getByRole("button", { name: "Save site" }).click();
  await expect(page.getByText("Site saved")).toBeVisible();

  await page.getByRole("link", { name: "Showroom" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Showroom" })).toBeVisible();

  const glance = page.getByRole("region", { name: "Restrictions summary" });
  for (const label of [
    "No HGVs",
    "Max 7.5 tonne",
    "Max length 10 m",
    "Max weight 7,500 kg",
    "Height limit 3.8 m",
    "Narrow access",
    "Pump truck on site",
    "Handball OK (2 people)",
    "Crane drop OK",
    "Book 48 h ahead",
    "PPE required",
    "Induction required",
    "Contact must be present",
  ]) {
    await expect(glance.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Tight turn into the loading bay")).toBeVisible();
  await expect(page.getByText("Unload in bay 2 only")).toBeVisible();
  await expect(page.getByText("Mon 08:00–17:00")).toBeVisible();
  await expect(page.getByText("Mon 09:00–11:00")).toBeVisible();

  // CF10 1EP is at 51.48023, -3.17919.
  await expect(pin(page)).toBeVisible();
  await expect.poll(() => pinPosition(page)).toEqual({ lat: 51.48023, lng: -3.17919 });
  await expect(page.getByText("Pin placed from the postcode.")).toBeVisible();

  // Never checked, so it's flagged until someone verifies it.
  await expect(page.getByText("Never verified")).toBeVisible();
  await page.getByRole("button", { name: "Mark as verified" }).click();
  await expect(page.getByText("Site marked as verified")).toBeVisible();
  await expect(page.getByText(/^Verified \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  await expect(page.getByText("by Sam Patel")).toBeVisible();
});

test("a pin can be corrected by dragging, by typed coordinates, and reset to the postcode", async ({
  page,
}) => {
  await page.goto("/customers");
  await page.getByRole("link", { name: "Cardiff Bay Interiors" }).click();
  await page.getByRole("link", { name: "Showroom" }).first().click();
  const start = await pinPosition(page);

  const box = (await pin(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const moved = await pinPosition(page);
  expect(moved.lng).toBeGreaterThan(start.lng);
  expect(moved.lat).toBeLessThan(start.lat);
  await page.getByRole("button", { name: "Save pin position" }).click();
  await expect(page.getByText("Pin position saved").last()).toBeVisible();
  await expect(page.getByText("Pin placed by hand.")).toBeVisible();

  await page.getByRole("button", { name: "Enter coordinates" }).click();
  const coords = page.getByRole("dialog", { name: "Enter coordinates" });
  await field(coords, "Latitude").fill("40");
  await coords.getByRole("button", { name: "Place pin" }).click();
  await expect(coords.getByText(/Enter a UK position/)).toBeVisible();
  await field(coords, "Latitude").fill("51.48100");
  await field(coords, "Longitude").fill("-3.18000");
  await coords.getByRole("button", { name: "Place pin" }).click();
  await expect(page.getByText("Pin position saved").last()).toBeVisible();
  await expect.poll(() => pinPosition(page)).toEqual({ lat: 51.481, lng: -3.18 });

  await page.getByRole("button", { name: "Reset to postcode" }).click();
  await expect(page.getByText("Pin reset to the postcode")).toBeVisible();
  await expect.poll(() => pinPosition(page)).toEqual(start);
});

test("an unknown postcode saves the site without a pin, and coordinates can place it", async ({
  page,
}) => {
  await page.goto("/customers");
  await page.getByRole("link", { name: "Cardiff Bay Interiors" }).click();
  await page.getByRole("button", { name: "Add site" }).first().click();
  const site = page.getByRole("dialog", { name: "Add site" });
  await field(site, "Site name").fill("New estate");
  await field(site, "Postcode").fill("CF99 9ZZ");
  await page.getByRole("button", { name: "Save site" }).click();
  await expect(page.getByText("We couldn't find that postcode on the map")).toBeVisible();

  const row = page
    .getByRole("table", { name: "Sites", exact: true })
    .getByRole("row", { name: /New estate/ });
  await expect(row).toContainText("no pin");
  await row.getByRole("link", { name: "New estate" }).click();
  await expect(page.getByText("We couldn't find CF99 9ZZ on the map")).toBeVisible();

  await page.getByRole("button", { name: "Enter coordinates" }).click();
  const coords = page.getByRole("dialog", { name: "Enter coordinates" });
  await field(coords, "Latitude").fill("51.47");
  await field(coords, "Longitude").fill("-3.16");
  await coords.getByRole("button", { name: "Place pin" }).click();
  await expect(page.getByText("Pin position saved").last()).toBeVisible();
  await expect.poll(() => pinPosition(page)).toEqual({ lat: 51.47, lng: -3.16 });
});

test("contacts belong to the customer or one site, with tap-to-call", async ({ page }) => {
  await page.goto("/customers");
  await page.getByRole("link", { name: "Cardiff Bay Interiors" }).click();
  await page.getByRole("tab", { name: /Contacts/ }).click();
  await page.getByRole("button", { name: "Add contact" }).first().click();
  const panel = page.getByRole("dialog", { name: "Add contact" });
  await field(panel, "Name").fill("Rhys Evans");
  await field(panel, "Role").fill("Showroom manager");
  await field(panel, "Phone").fill("029 2000 1234");
  await field(panel, "Email").fill("rhys@");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(panel.getByText("Enter a valid email address.")).toBeVisible();
  await field(panel, "Email").fill("rhys@cardiffbay.example");
  await choose(page, panel, "Site", "Showroom");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("Contact saved")).toBeVisible();

  const row = page
    .getByRole("table", { name: "Contacts", exact: true })
    .getByRole("row", { name: /Rhys Evans/ });
  await expect(row).toContainText("Showroom");
  await expect(row.getByRole("link", { name: "029 2000 1234" })).toHaveAttribute(
    "href",
    "tel:02920001234",
  );

  await page.getByRole("tab", { name: /Sites/ }).click();
  await page.getByRole("link", { name: "Showroom" }).first().click();
  await expect(page.getByRole("link", { name: /029 2000 1234/ })).toHaveAttribute(
    "href",
    "tel:02920001234",
  );
});

test("stale site details are shown on the site and fixed by verifying", async ({ page }) => {
  await page.goto("/customers");
  await page.getByRole("link", { name: "Marlow Joinery" }).click();
  const row = page
    .getByRole("table", { name: "Sites", exact: true })
    .getByRole("row", { name: /Gloucester workshop/ });
  await expect(row).toContainText("Last verified 04/11/2025, over 180 days ago");
  await row.getByRole("link", { name: "Gloucester workshop" }).click();
  await expect(
    page.getByText("Check these details with the customer, then mark them as verified."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark as verified" }).click();
  await expect(page.getByText(/^Verified \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
});

test("deleting a site and a customer asks first", async ({ page }) => {
  /** Click Delete until the confirmation opens (a click can land before the page is interactive). */
  async function confirmDelete(name: string) {
    const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
    await expect(async () => {
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass();
    await dialog.getByRole("button", { name: "Delete" }).click();
  }

  await page.goto("/customers");
  await page.getByRole("link", { name: "Cardiff Bay Interiors" }).click();
  await page.getByRole("link", { name: "New estate" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "New estate" })).toBeVisible();
  await confirmDelete("New estate");
  await expect(
    page.getByRole("heading", { level: 1, name: "Cardiff Bay Interiors" }),
  ).toBeVisible();

  await confirmDelete("Cardiff Bay Interiors");
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cardiff Bay Interiors" })).toHaveCount(0);
});

test.describe("office staff", () => {
  test.use({ storageState: "e2e/.auth/office.json" });

  test("can view customers and sites but not change them", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByRole("link", { name: "Oakfield Homes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add customer" })).toHaveCount(0);
    await page.getByRole("link", { name: "Oakfield Homes" }).click();
    await expect(page.getByRole("button", { name: "Edit customer" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add site" })).toHaveCount(0);
    await page.getByRole("link", { name: "Plot 14, Meadow View" }).first().click();
    await expect(page.getByRole("region", { name: "Restrictions summary" })).toContainText(
      "Max 7.5 tonne",
    );
    await expect(page.getByRole("button", { name: "Mark as verified" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit site" })).toHaveCount(0);
    await expect(page.locator(".map-edit-pin")).toHaveCount(0);
    await expect(page.locator("path.map-pin")).toHaveCount(1);
  });
});
