import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./support/accounts";

const signedOut = { storageState: { cookies: [], origins: [] } };

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
}

test.describe("signed out", () => {
  test.use(signedOut);

  test("protected pages send you to sign in, then back where you were going", async ({ page }) => {
    const { adminEmail } = JSON.parse(readFileSync("e2e/.auth/company.json", "utf8"));
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Forders$/);

    await page.getByLabel("Email").fill(adminEmail);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That email and password don't match")).toBeVisible();

    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  });

  test("sign-up checks the form before sending it", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("A");
    await page.getByLabel("Work email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  });

  test("a new customer signs up, creates their company and becomes its admin", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("Rhiannon Price");
    await page.getByLabel("Work email").fill(uniqueEmail("founder"));
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: "Set up your company" })).toBeVisible();
    await page.getByLabel("Company name").fill("Brecon Tyres Ltd");
    await page.getByRole("button", { name: "Create company" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(mainNav(page).getByText("Brecon Tyres Ltd").first()).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Settings" })).toBeVisible();

    // Signing out ends the session.
    await page
      .getByRole("button", { name: /Account and display settings/ })
      .filter({ visible: true })
      .click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("an invitation link that doesn't exist is explained", async ({ page }) => {
    await page.goto(`/invite/${"0".repeat(64)}`);
    await expect(page.getByRole("heading", { name: "Invitation not found" })).toBeVisible();
  });
});

test("an admin invites a colleague, who joins with the right role", async ({ page, browser }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: /Users & roles/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Users & roles" })).toBeVisible();

  const email = uniqueEmail("newstarter");
  await page.getByRole("button", { name: "Invite someone" }).click();
  const invite = page.getByRole("dialog", { name: "Invite someone" });
  await invite.getByLabel("Email").fill(email);
  await invite.getByRole("combobox").click();
  await page.getByRole("option", { name: "Office" }).click();
  await invite.getByRole("button", { name: "Create invitation" }).click();

  const ready = page.getByRole("dialog", { name: "Invitation ready" });
  const link = await ready.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/invite\/[0-9a-f]{64}$/);
  await ready.getByRole("button", { name: "Done" }).first().click();
  await expect(
    page.getByRole("table", { name: "Pending invitations" }).getByText(email),
  ).toBeVisible();

  // The colleague opens the link in their own browser.
  const context = await browser.newContext(signedOut);
  const guest = await context.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Join Example Doors Ltd" })).toBeVisible();
  await guest.getByRole("link", { name: "Create account" }).click();
  await expect(guest.getByLabel("Work email")).toHaveValue(email);
  await guest.getByLabel("Your name").fill("Nia Newstarter");
  await guest.getByLabel("Password").fill(PASSWORD);
  await guest.getByRole("button", { name: "Create account" }).click();
  await guest.getByRole("button", { name: "Accept invitation" }).click();

  await expect(guest.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  const nav = mainNav(guest);
  await expect(nav.getByRole("link")).toHaveText([
    "Today",
    "Plan",
    "Orders",
    "Customers",
    "History",
  ]);

  // Roles are enforced on the server, not just hidden: typing the address doesn't help.
  await guest.goto("/settings/users");
  await expect(
    guest.getByRole("heading", { name: "You don't have access to that page" }),
  ).toBeVisible();

  // The link only works once.
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Invitation already used" })).toBeVisible();
  await context.close();

  await page.reload();
  const members = page.getByRole("table", { name: "Members" });
  await expect(members.getByText("Nia Newstarter")).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Pending invitations" }).getByText(email),
  ).toHaveCount(0);
});

test("the last admin can't demote themselves", async ({ page }) => {
  await page.goto("/settings/users");
  const me = page.getByRole("row", { name: /Sam Patel/ });
  await me.getByRole("combobox").click();
  await page.getByRole("option", { name: "Planner" }).click();
  await expect(page.getByText("Every organisation needs at least one admin")).toBeVisible();
  await expect(me.getByRole("combobox")).toHaveText("Admin");
});

const ROLE_HOMES = [
  { role: "office", home: "Today", tabs: ["Today", "Plan", "Orders", "Customers", "History"] },
  { role: "warehouse", home: "Warehouse", tabs: ["Warehouse"] },
  { role: "driver", home: "My run", tabs: ["My run"] },
] as const;

for (const { role, home, tabs } of ROLE_HOMES) {
  test.describe(`${role} role`, () => {
    test.use({ storageState: `e2e/.auth/${role}.json` });

    test(`lands on ${home} and only sees their tabs`, async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: home })).toBeVisible();
      await expect(mainNav(page).getByRole("link")).toHaveText([...tabs]);
      for (const path of ["/settings", "/settings/users"]) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: "You don't have access to that page" }),
        ).toBeVisible();
      }
    });
  });
}
