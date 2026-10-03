import { format } from "date-fns";
import { expect, test, type Page } from "@playwright/test";
import { planningDays } from "./support/accounts";

/**
 * Stage 5 "Done when": the demo data shows each warning with working fixes,
 * and blocking warnings prevent confirmation unless overridden with a reason.
 * Demo loads (seedPlanning in e2e/support/accounts.ts) sit on the first three
 * working days: d0, d1 and d2.
 */

test.describe.configure({ mode: "serial" });

const { d0, d1, d2 } = planningDays();

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return format(new Date(y, m - 1, d), "EEE d MMM");
};

/** The day column on the board for a date. */
function day(page: Page, iso: string) {
  return page.getByRole("region", { name: dayLabel(iso), exact: true });
}

async function openBoard(page: Page, iso: string) {
  await page.goto(`/plan?week=${iso}`);
  await expect(page.getByRole("heading", { level: 1, name: "Plan" })).toBeVisible();
}

/** Opens a load's side panel from its card, returning the panel. */
async function openLoad(page: Page, iso: string, title: string, nth = 0) {
  const card = day(page, iso)
    .getByRole("article", { name: `${title} load` })
    .nth(nth);
  const panel = page.getByRole("dialog", { name: title });
  await expect(async () => {
    await card.getByRole("button").first().click();
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass();
  return panel;
}

const warning = (panel: ReturnType<Page["getByRole"]>, title: string | RegExp) =>
  panel.getByRole("list", { name: "Warnings" }).getByRole("listitem").filter({ hasText: title });

test("the demo loads show every warning in spec 7.2, each in plain English", async ({ page }) => {
  await openBoard(page, d1);

  let panel = await openLoad(page, d1, "Luton 1");
  for (const title of [
    "Upright units can't come off by tail lift here",
    "Handball at Gloucester workshop: 2 people needed",
    "Crew of 2 needed",
    "PL-301 is part ready",
    "Check Plot 14, Meadow View's details",
  ]) {
    await expect(warning(panel, title)).toBeVisible();
  }
  await expect(warning(panel, "Upright units")).toContainText(
    "PL-302: 2 × Door pack must travel upright",
  );
  await page.keyboard.press("Escape");

  panel = await openLoad(page, d1, "7.5t curtainsider");
  for (const title of [
    "Over the vehicle's space",
    "Over the vehicle's payload",
    "PL-303 will be late",
  ]) {
    await expect(warning(panel, title)).toBeVisible();
  }
  await expect(warning(panel, "Over the vehicle's space")).toContainText(
    "14 UKP on a vehicle that takes 10",
  );
  await page.keyboard.press("Escape");

  await openBoard(page, d2);
  panel = await openLoad(page, d2, "18t curtainsider");
  for (const title of [
    "18t curtainsider can't get into Plot 14, Meadow View",
    "No way to unload at Plot 14, Meadow View",
    "PL-304 won't be ready",
  ]) {
    await expect(warning(panel, title)).toBeVisible();
  }
  await page.keyboard.press("Escape");

  panel = await openLoad(page, d2, "7.5t curtainsider");
  await expect(warning(panel, "Newcastle and Gateshead Clean Air Zone")).toContainText(
    "isn't marked clean air zone compliant",
  );
  // Road routing (the stand-in service) gives road times; without it this reads "Estimate: about".
  await expect(warning(panel, "Run may be too long for one driver")).toContainText(
    "Road route: about",
  );
  await page.keyboard.press("Escape");

  panel = await openLoad(page, d2, "Luton 1");
  await expect(warning(panel, "Too heavy for the tail lift")).toContainText(
    "PL-307: UK pallet at 800 kg each",
  );
  await page.keyboard.press("Escape");

  await openBoard(page, d0);
  panel = await openLoad(page, d0, "Severn Pallet Network");
  await expect(warning(panel, "Book in at Newport depot")).toBeVisible();
  await expect(
    warning(panel, /Arrives outside Newport depot's (opening hours|delivery window)/),
  ).toContainText("17:15");
  await expect(warning(panel, "Confirm delivery with Newport depot")).toBeVisible();
  await page.keyboard.press("Escape");

  panel = await openLoad(page, d0, "18t curtainsider");
  await expect(panel.getByText("No warnings for this load.")).toBeVisible();
});

test("fixes resolve their warnings", async ({ page }) => {
  // Switch vehicle: the 18t is free on d1, so the capacity warnings offer it.
  await openBoard(page, d1);
  let panel = await openLoad(page, d1, "7.5t curtainsider");
  await warning(panel, "Over the vehicle's space")
    .getByRole("button", { name: "Switch to 18t curtainsider" })
    .click();
  panel = page.getByRole("dialog", { name: "18t curtainsider" });
  await expect(panel).toBeVisible();
  await expect(warning(panel, "Over the vehicle's space")).toHaveCount(0);
  await expect(warning(panel, "Over the vehicle's payload")).toHaveCount(0);
  await expect(warning(panel, "PL-303 will be late")).toBeVisible();
  await page.keyboard.press("Escape");

  // Set crew.
  panel = await openLoad(page, d1, "Luton 1");
  await warning(panel, "Crew of 2 needed").getByRole("button", { name: "Set crew to 2" }).click();
  await expect(warning(panel, "Crew of 2 needed")).toHaveCount(0);
  await expect(warning(panel, "Handball at Gloucester workshop")).toBeVisible();
  await page.keyboard.press("Escape");

  // Add booking ref: the stop's form opens on the booking field.
  await openBoard(page, d0);
  panel = await openLoad(page, d0, "Severn Pallet Network");
  await warning(panel, "Book in at Newport depot")
    .getByRole("button", { name: "Add booking ref" })
    .click();
  const booking = panel.getByLabel("Booking ref");
  await expect(booking).toBeFocused();
  await booking.fill("GI-4471");
  await panel.getByLabel("Arrive from").fill("09:30");
  await panel.getByRole("button", { name: "Save stop" }).click();
  await expect(warning(panel, "Book in at Newport depot")).toHaveCount(0);
  await expect(warning(panel, /Arrives outside/)).toHaveCount(0);
  await expect(panel.getByText("Booking GI-4471")).toBeVisible();

  // Record confirmation.
  await warning(panel, "Confirm delivery with Newport depot")
    .getByRole("button", { name: "Record confirmation" })
    .click();
  await panel.getByText("Delivery confirmed with the customer").click();
  await panel.getByLabel("Confirmed by").fill("Goods-in");
  await panel.getByRole("button", { name: "Save stop" }).click();
  await expect(warning(panel, "Confirm delivery with Newport depot")).toHaveCount(0);
  await expect(panel.getByText("Confirmed by Goods-in")).toBeVisible();
  await page.keyboard.press("Escape");

  // Take an order off: it goes back to the unplanned pool.
  await openBoard(page, d2);
  panel = await openLoad(page, d2, "18t curtainsider");
  await warning(panel, "PL-304 won't be ready")
    .getByRole("button", { name: "Take PL-304 off this load" })
    .click();
  await expect(warning(panel, "PL-304 won't be ready")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("list", { name: "Orders to plan" }).getByRole("link", { name: "PL-304" }),
  ).toBeVisible();
});

test("a blocking warning stops confirmation until it's overridden with a reason", async ({
  page,
}) => {
  await openBoard(page, d1);
  const panel = await openLoad(page, d1, "Luton 1");
  const confirm = panel.getByRole("button", { name: "Confirm load" });
  await expect(confirm).toBeDisabled();
  await expect(
    panel.getByText("1 blocking warning to fix or override before confirming."),
  ).toBeVisible();

  const upright = warning(panel, "Upright units can't come off by tail lift here");
  await upright.getByRole("button", { name: "Override…" }).click();
  const modal = page.getByRole("dialog", { name: "Override blocking warning" });
  await modal.getByRole("button", { name: "Override and log" }).click();
  await expect(modal.getByText("Write a short reason")).toBeVisible();
  await modal.getByLabel(/Reason/).fill("Site will borrow a forklift from next door");
  await modal.getByRole("button", { name: "Override and log" }).click();

  await expect(upright).toContainText(
    "Overridden by Sam Patel: Site will borrow a forklift from next door",
  );
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(panel.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Start loading" })).toBeVisible();

  // Dismissing a check hides it for this load, and it can be shown again.
  await warning(panel, "Check Plot 14, Meadow View's details")
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(warning(panel, "Check Plot 14, Meadow View's details")).toHaveCount(0);
  await panel.getByRole("button", { name: "Show 1 dismissed" }).click();
  await expect(
    panel.getByText(/Check Plot 14, Meadow View's details · dismissed by Sam Patel/),
  ).toBeVisible();

  // Changing a confirmed load sends it back to planned.
  await panel.getByRole("button", { name: "Move stop 2 up" }).click();
  await expect(panel.getByText("Planned", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("list", { name: "Stops in drop order" }).getByRole("link").first(),
  ).toHaveText("Plot 14, Meadow View");
});

test("dragging an order onto a load previews the capacity, then adds it", async ({ page }) => {
  await openBoard(page, d2);
  const card = day(page, d2).getByRole("article", { name: "18t curtainsider load" });
  await expect(card.getByRole("meter", { name: "Space" })).toHaveAttribute("aria-valuenow", "0");

  const handle = page.getByRole("button", { name: "Drag PL-304 onto a load" });
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await card.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  // Before dropping, the bars already include the order: 4 of 18 Euro pallet spaces is 22%.
  await expect(card.getByRole("meter", { name: "Space" })).toHaveAttribute("aria-valuenow", "22");
  await expect(card.getByRole("meter", { name: "Weight" })).toHaveAttribute(
    "aria-valuenow",
    "1200",
  );
  await page.mouse.up();

  await expect(card).toContainText("Plot 14");
  await expect(card.getByRole("meter", { name: "Space" })).toHaveAttribute("aria-valuenow", "4");
  await expect(
    page.getByRole("list", { name: "Orders to plan" }).getByRole("link", { name: "PL-304" }),
  ).toHaveCount(0);
});

test("orders can be added without dragging, and loads created, reordered and deleted", async ({
  page,
}) => {
  await openBoard(page, d2);
  await page.getByRole("button", { name: `New load on ${dayLabel(d2)}` }).click();
  const modal = page.getByRole("dialog", { name: "New load" });
  await modal.getByLabel("Vehicle or haulier").click();
  await page.getByRole("option", { name: "Haulier: Cotswold Haulage" }).click();
  await modal.getByRole("button", { name: "Create load" }).click();
  const panel = page.getByRole("dialog", { name: "Cotswold Haulage" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("No stops yet.")).toBeVisible();
  await page.keyboard.press("Escape");

  for (const ref of ["SO-24101", "SO-24103"]) {
    await page.getByRole("button", { name: `Add ${ref} to a load` }).click();
    await page.getByRole("menuitem", { name: `${dayLabel(d2)} · Cotswold Haulage` }).click();
    await expect(
      page.getByRole("list", { name: "Orders to plan" }).getByRole("link", { name: ref }),
    ).toHaveCount(0);
  }
  const reopened = await openLoad(page, d2, "Cotswold Haulage");
  const stops = reopened.getByRole("list", { name: "Stops in drop order" });
  await expect(stops.getByRole("link", { name: /yard|depot/ })).toHaveText([
    "Stroud yard",
    "Newport depot",
  ]);
  await reopened.getByRole("button", { name: "Move stop 2 up" }).click();
  await expect(stops.getByRole("link", { name: /yard|depot/ })).toHaveText([
    "Newport depot",
    "Stroud yard",
  ]);

  await reopened.getByRole("button", { name: "Delete load" }).click();
  await page
    .getByRole("dialog", { name: "Delete this load?" })
    .getByRole("button", { name: "Delete load" })
    .click();
  await expect(day(page, d2).getByRole("article", { name: "Cotswold Haulage load" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("list", { name: "Orders to plan" }).getByRole("link", { name: "SO-24101" }),
  ).toBeVisible();
});

test.describe("office staff", () => {
  test.use({ storageState: "e2e/.auth/office.json" });

  test("can see the plan and warnings but not change anything", async ({ page }) => {
    await openBoard(page, d2);
    await expect(page.getByRole("button", { name: /^Drag / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^New load on/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Add .* to a load$/ })).toHaveCount(0);
    const panel = await openLoad(page, d2, "Luton 1");
    await expect(warning(panel, "Too heavy for the tail lift")).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /Override|Dismiss|Switch to|Confirm load|Edit load/ }),
    ).toHaveCount(0);
  });
});
