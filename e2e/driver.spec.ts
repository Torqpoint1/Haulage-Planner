import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoOverflow } from "./helpers";
import { driverRunRecords } from "./support/accounts";

/**
 * Stage 8 "Done when": POD with signature and photos saves correctly,
 * including after a period offline. Uses today's run for the "Dan Driver"
 * login (seedDriverRun): Stroud yard, Gloucester workshop, Plot 14.
 */

test.describe.configure({ mode: "serial" });
test.use({ storageState: "e2e/.auth/driver.json", viewport: { width: 375, height: 812 } });

// A real 1 × 1 PNG, standing in for a phone photo.
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const stop = (page: Page, n: number, name: string) =>
  page.getByRole("article", { name: `Stop ${n}: ${name}` });

async function sign(sheet: Locator) {
  const pad = sheet.getByRole("img", { name: /^Signature/ });
  const box = (await pad.boundingBox())!;
  const page = sheet.page();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + 20 + i * 20, box.y + box.height / 2 + (i % 2 ? -15 : 15));
  }
  await page.mouse.up();
  await expect(sheet.getByRole("img", { name: "Signature: signed" })).toBeVisible();
}

async function addPhoto(sheet: Locator, name: string) {
  await sheet
    .locator("input[type=file]")
    .setInputFiles({ name, mimeType: "image/png", buffer: PHOTO });
  await expect(
    sheet.getByRole("list", { name: "Photos" }).getByRole("listitem").last(),
  ).toBeVisible();
}

test("the driver sees today's run, with what they need at each stop", async ({ page }) => {
  await page.goto("/driver");
  await expect(page.getByRole("heading", { level: 1, name: "My run" })).toBeVisible();
  const stops = page.getByRole("list", { name: "Stops for Luton 1" }).getByRole("article");
  await expect(stops).toHaveCount(3);

  const first = stop(page, 1, "Stroud yard");
  await expect(first).toContainText("Next stop");
  await expect(first).toContainText("Use the side gate; goods-in is behind the timber store.");
  await expect(first.getByRole("list", { name: "Handling" })).toContainText("Keep upright");
  await expect(first.getByRole("link", { name: "Navigate" })).toHaveAttribute(
    "href",
    /google\.com\/maps\/dir\/\?api=1&destination=51\.73602%2C-2\.22381/,
  );
  await expect(first.getByRole("link", { name: "Call Gemma Hill" })).toHaveAttribute(
    "href",
    "tel:01453000123",
  );

  const second = stop(page, 2, "Gloucester workshop");
  await expect(second).toContainText("Booked for 10:30 · ref GL-2231");
  await expect(second).toContainText("Access: Narrow lane; reverse in from the main road.");
  await expect(second.getByRole("link", { name: "Call Tom Marlow" })).toBeVisible();
  await expect(stop(page, 3, "Plot 14, Meadow View")).toContainText("PPE required");
  await expectNoOverflow(page);
});

test("the form says what's missing before anything is saved", async ({ page }) => {
  await page.goto("/driver");
  await stop(page, 1, "Stroud yard")
    .getByRole("button", { name: "Delivered", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Stroud yard" });
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Enter the name of the person who received it.")).toBeVisible();
  await expect(sheet.getByText("Get a signature, or tick that nobody can sign.")).toBeVisible();

  await sheet.getByRole("checkbox", { name: "Nobody available to sign" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Take a photo to show where you left it.")).toBeVisible();

  await sheet.getByRole("radio", { name: "Failed" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Choose why the delivery failed.")).toBeVisible();
  await expect(sheet.getByText("Add a note saying what happened.")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  expect((await driverRunRecords()).pods).toHaveLength(0);
});

test("proof of delivery with signature and photos saves, including after a period offline", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto("/driver");
  // The phone keeps the run page and its files for when there's no signal.
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(await caches.match("/driver"));
  });

  await context.setOffline(true);

  // Stop 1: delivered, signed, with a photo.
  await stop(page, 1, "Stroud yard")
    .getByRole("button", { name: "Delivered", exact: true })
    .click();
  let sheet = page.getByRole("dialog", { name: "Stroud yard" });
  await sheet.getByLabel("Received by").fill("Gemma Hill");
  await sign(sheet);
  await addPhoto(sheet, "stroud.png");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status", { name: "Deliveries waiting to send" })).toContainText(
    "1 delivery saved on this phone, waiting to send.",
  );
  await expect(stop(page, 1, "Stroud yard")).toContainText("Waiting to send");
  await expect(stop(page, 2, "Gloucester workshop")).toContainText("Next stop");

  // Stop 2: part delivered, one door pack short, with a note and a photo.
  await stop(page, 2, "Gloucester workshop")
    .getByRole("button", { name: "Part delivered" })
    .click();
  sheet = page.getByRole("dialog", { name: "Gloucester workshop" });
  await sheet.getByLabel("Received by").fill("Tom Marlow");
  await sign(sheet);
  await sheet.getByLabel(/DR-402 · Door pack \(of 3\)/).fill("2");
  await sheet.getByLabel("Damage or shortage notes").fill("One door pack damaged; brought back.");
  await addPhoto(sheet, "damage.png");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(stop(page, 2, "Gloucester workshop")).toContainText("Waiting to send");

  // Stop 3: failed, with a reason and a note.
  await stop(page, 3, "Plot 14, Meadow View").getByRole("button", { name: "Failed" }).click();
  sheet = page.getByRole("dialog", { name: "Plot 14, Meadow View" });
  await sheet.getByRole("combobox", { name: "Why did it fail?" }).click();
  await page.getByRole("option", { name: "Site closed" }).click();
  await sheet.getByLabel("What happened?").fill("Gates locked; no answer from the site manager.");
  await sheet.getByRole("button", { name: "Save" }).click();

  const outbox = page.getByRole("status", { name: "Deliveries waiting to send" });
  await expect(outbox).toContainText("3 deliveries saved on this phone, waiting to send.");
  await page.screenshot({ path: "screenshots/light/375/driver-offline.png", fullPage: true });

  // Still no signal: the phone restarts the page. Everything is still there.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "My run" })).toBeVisible();
  await expect(outbox).toContainText("3 deliveries saved on this phone, waiting to send.");
  await expect(stop(page, 3, "Plot 14, Meadow View")).toContainText("Waiting to send");
  expect((await driverRunRecords()).pods).toHaveLength(0);

  // Signal comes back: it all sends by itself.
  await context.setOffline(false);
  await expect(outbox).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Waiting to send")).toHaveCount(0);
  await expect(stop(page, 1, "Stroud yard")).toContainText("received by Gemma Hill");
  await expect(stop(page, 3, "Plot 14, Meadow View")).toContainText("Failed at");

  const saved = await driverRunRecords();
  expect(saved.pods.map((p) => p.outcome).sort()).toEqual([
    "delivered",
    "failed",
    "part_delivered",
  ]);
  const delivered = saved.pods.find((p) => p.outcome === "delivered")!;
  expect(delivered.signature_path).toMatch(/\/signature\.png$/);
  expect(delivered.photo_paths).toHaveLength(1);
  expect(saved.orders.map((o) => [o.order_ref, o.status])).toEqual([
    ["DR-401", "delivered"],
    ["DR-402", "delivered"],
    ["DR-403", "failed"],
  ]);
});

test.describe("planners", () => {
  test.use({ storageState: "e2e/.auth/admin.json", viewport: { width: 1280, height: 800 } });

  test("see the proof of delivery and can put a failed order back to plan", async ({ page }) => {
    const { loadId } = await driverRunRecords();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
      new Date(),
    );
    await page.goto(`/plan?week=${today}&weekend=1&load=${loadId}`);
    const panel = page.getByRole("dialog", { name: "Luton 1" });
    await expect(panel).toContainText("Complete");
    const stops = panel.getByRole("list", { name: "Stops in drop order" }).locator(":scope > li");

    await stops.nth(0).getByRole("button", { name: "Proof of delivery" }).click();
    let pod = page.getByRole("dialog", { name: "Proof of delivery" });
    await expect(pod).toContainText("Stroud yard");
    await expect(pod).toContainText("Gemma Hill");
    const signature = pod.getByRole("img", { name: "Signature of Gemma Hill" });
    await expect(signature).toBeVisible();
    await expect
      .poll(() => signature.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(pod.getByRole("list", { name: "Photos" }).getByRole("img")).toHaveCount(1);
    await expect(pod.getByRole("region", { name: "Quantities delivered" })).toContainText("2 of 2");
    await pod.getByRole("button", { name: "Close" }).first().click();

    await stops.nth(1).getByRole("button", { name: "Proof of delivery" }).click();
    pod = page.getByRole("dialog", { name: "Proof of delivery" });
    await expect(pod).toContainText("Part delivered");
    await expect(pod).toContainText("One door pack damaged; brought back.");
    await expect(pod.getByRole("region", { name: "Quantities delivered" })).toContainText(
      "2 of 31 short",
    );
    await page.screenshot({ path: "screenshots/light/1280/pod-details.png" });
    await pod.getByRole("button", { name: "Close" }).first().click();

    await stops.nth(2).getByRole("button", { name: "Proof of delivery" }).click();
    pod = page.getByRole("dialog", { name: "Proof of delivery" });
    await expect(pod).toContainText("Site closed");
    await expect(pod).toContainText("Gates locked; no answer from the site manager.");
    await pod.getByRole("button", { name: "Put back to plan" }).click();
    await expect(page.getByText("DR-403 is back in the unplanned orders")).toBeVisible();
    await expect(pod.getByText("Re-planned")).toBeVisible();
    expect((await driverRunRecords()).orders.find((o) => o.order_ref === "DR-403")?.status).toBe(
      "unplanned",
    );
  });
});
