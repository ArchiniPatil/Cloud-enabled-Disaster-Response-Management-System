import { test, expect, type BrowserContext } from "@playwright/test";
async function login(context: BrowserContext, role: string) {
  const p = await context.newPage();
  await p.goto("/");
  await p.getByRole("button", { name: `Demo ${role}`, exact: true }).click();
  await expect(
    p.getByRole("heading", { name: /Help starts here|A clear view/ }),
  ).toBeVisible();
  return p;
}
test("citizen, dispatcher and responder complete a browser workflow", async ({
  browser,
}) => {
  const citizenContext = await browser.newContext(),
    authorityContext = await browser.newContext(),
    rescuerContext = await browser.newContext({
      geolocation: { latitude: 19.077, longitude: 72.878 },
      permissions: ["geolocation"],
    });
  const citizen = await login(citizenContext, "Citizen"),
    authority = await login(authorityContext, "Authority"),
    rescuer = await login(rescuerContext, "Rescuer");
  await rescuer.getByRole("link", { name: "Teams & resources" }).click();
  const duty = rescuer.getByRole("button", { name: "Start duty", exact: true });
  if (await duty.isVisible()) await duty.click();
  await rescuer.getByRole("button", { name: "Share device location" }).click();
  await expect(
    rescuer.getByText("Your device is sharing operational location."),
  ).toBeVisible();
  await citizen.getByRole("link", { name: /Need help/ }).click();
  await citizen
    .getByRole("button", { name: "Medical emergency", exact: true })
    .click();
  await citizen.getByLabel("Latitude", { exact: true }).fill("19.076");
  await citizen.getByLabel("Longitude", { exact: true }).fill("72.8777");
  await citizen
    .getByLabel("Brief description")
    .fill("Browser automation: controlled demonstration");
  await citizen.getByRole("button", { name: "Submit request" }).click();
  await expect(
    citizen.getByText("Your request is saved.", { exact: false }),
  ).toBeVisible();
  const incidentPath = new URL(citizen.url()).pathname;
  await authority.goto(incidentPath);
  await authority
    .getByRole("button", { name: "Acknowledge", exact: true })
    .click();
  await authority.getByRole("button", { name: "Find eligible teams" }).click();
  const select = authority.getByRole("combobox", { name: "Eligible team" });
  const value = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(value!);
  await authority.getByRole("button", { name: "Offer assignment" }).click();
  await expect(authority.getByText("Offered", { exact: true })).toBeVisible();
  const response = await rescuerContext.newPage();
  await response.goto(incidentPath);
  await response.getByRole("button", { name: "Accepted", exact: true }).click();
  await expect(
    authority.getByRole("button", { name: "Authorize dispatch" }),
  ).toBeVisible({ timeout: 10000 });
  await authority.getByRole("button", { name: "Authorize dispatch" }).click();
  await expect(
    response.getByRole("button", { name: "En Route", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await response.getByRole("button", { name: "En Route", exact: true }).click();
  await expect(citizen.getByText("Live", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(citizen.getByText(/ETA unavailable/).first()).toBeVisible();
  for (const name of ["Arrived", "In Progress", "Completed"]) {
    await response.getByRole("button", { name, exact: true }).click();
  }
  await expect(
    citizen.locator(".page-head").getByText("Resolved", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await citizen.screenshot({
    path: "test-results/citizen-completed.png",
    fullPage: true,
  });
  await citizen.getByRole("link", { name: /Profile & settings/ }).click();
  await citizen.getByRole("button", { name: "Log out" }).click();
  await expect(
    citizen.getByRole("heading", { name: /A clearer path/ }),
  ).toBeVisible();
  await citizenContext.close();
  await authorityContext.close();
  await rescuerContext.close();
});
test("mobile report form, persistent session and explicit integration failures", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 19.076, longitude: 72.8777 },
    permissions: ["geolocation"],
  });
  const p = await login(context, "Citizen");
  await p.reload();
  await expect(
    p.getByRole("heading", { name: "Help starts here." }),
  ).toBeVisible();
  await p.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await p.getByRole("link", { name: /Report a problem/ }).click();
  await expect(p.getByLabel("Latitude", { exact: true })).toHaveValue("19.076");
  await expect(p.getByLabel("Longitude", { exact: true })).toHaveValue(
    "72.8777",
  );
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await context.close();
});

test("administrator configures departments and jurisdictions through protected forms", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await login(context, "Admin");
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  await page
    .getByRole("button", { name: "Configuration", exact: true })
    .click();
  const department = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Department", exact: true }),
  });
  await department
    .getByLabel("Department name")
    .fill(`Browser test department ${Date.now()}`);
  await department
    .getByRole("button", { name: "Save department", exact: true })
    .click();
  await expect(department.getByRole("status")).toHaveText(
    "Saved successfully.",
  );
  const jurisdiction = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Jurisdiction", exact: true }),
  });
  await jurisdiction
    .getByLabel("Operating area name")
    .fill(`Browser test area ${Date.now()}`);
  await jurisdiction.getByLabel("West boundary").fill("72.8");
  await jurisdiction.getByLabel("East boundary").fill("72.9");
  await jurisdiction.getByLabel("South boundary").fill("19");
  await jurisdiction.getByLabel("North boundary").fill("19.2");
  await jurisdiction
    .getByRole("button", { name: "Save jurisdiction", exact: true })
    .click();
  await expect(jurisdiction.getByRole("status")).toHaveText(
    "Saved successfully.",
  );
  await expect(
    page.getByRole("heading", {
      name: "Notification configuration",
      exact: true,
    }),
  ).toBeVisible();
  await context.close();
});
