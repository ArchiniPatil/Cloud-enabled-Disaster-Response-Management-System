import { test, expect, type BrowserContext } from "@playwright/test";
async function login(context: BrowserContext, role: string) {
  const p = await context.newPage();
  await p.goto("/");
  await expect(
    p.getByRole("button", { name: /^Demo (Citizen|Authority|Rescuer|Admin)$/ }),
  ).toHaveCount(0);
  await p.getByRole("link", { name: /Open Development/ }).click();
  await p.getByLabel("Demo role").selectOption(role.toLowerCase());
  await p.getByRole("button", { name: "Continue with local account" }).click();
  await expect(
    p.getByRole("heading", {
      name: /My reports and assistance|Operations overview|Responder workspace|Administration overview/,
    }),
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
    if (name === "Completed") {
      await response
        .getByLabel("Reason or outcome")
        .fill(
          "Controlled exercise: assistance completed, no outstanding needs",
        );
      await response
        .getByRole("button", { name: "Confirm Completed", exact: true })
        .click();
    }
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
    citizen.getByRole("heading", {
      name: /Disaster Response and Management System/,
    }),
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
    p.getByRole("heading", { name: "My reports and assistance" }),
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
  await p
    .getByRole("button", { name: "Choose on map or search address" })
    .click();
  await expect(
    p.getByText("Amazon Location map is not configured", { exact: true }),
  ).toBeVisible();
  await expect(p.getByLabel("Latitude", { exact: true })).toHaveValue("19.076");
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

test("administrator manages an organization and authority corrects a notice and views metrics", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await login(context, "Admin");
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  const form = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Organization", exact: true }),
  });
  const name = `Browser organization ${Date.now()}`;
  await form.getByLabel("Organization name").fill(name);
  await form
    .getByRole("button", { name: "Save organization", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `Organization: ${name}`, exact: true }),
  ).toBeVisible();
  await context.close();
  const authorityContext = await browser.newContext();
  const authority = await login(authorityContext, "Authority");
  await authority
    .getByRole("link", { name: "Announcements", exact: true })
    .click();
  await authority
    .getByRole("button", { name: "Publish notice", exact: true })
    .click();
  const title = `Controlled browser notice ${Date.now()}`;
  await authority.getByLabel("Title", { exact: true }).fill(title);
  await authority
    .getByLabel("Message", { exact: true })
    .fill("Controlled browser announcement; no real emergency.");
  const expires = new Date(Date.now() + 86400000);
  await authority
    .getByLabel("Expires at")
    .fill(
      new Date(expires.getTime() - expires.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  await authority
    .getByRole("button", { name: "Publish announcement", exact: true })
    .click();
  let article = authority.locator("article").filter({
    has: authority.getByRole("heading", { name: title, exact: true }),
  });
  await article.getByRole("button", { name: "Correct notice" }).click();
  await authority
    .getByLabel("Title", { exact: true })
    .fill(`${title} corrected`);
  await authority.getByRole("button", { name: "Save correction" }).click();
  article = authority.locator("article").filter({
    has: authority.getByRole("heading", {
      name: `${title} corrected`,
      exact: true,
    }),
  });
  authority.once("dialog", (dialog) => dialog.accept());
  await article.getByRole("button", { name: "Withdraw notice" }).click();
  await expect(article).toHaveCount(0);
  await authority
    .getByRole("link", { name: "Operational metrics", exact: true })
    .click();
  await expect(
    authority.getByRole("heading", { name: "Team workload" }),
  ).toBeVisible();
  await authorityContext.close();
});

test("development access is separate and a failed session lookup is visible and retryable", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    p = await context.newPage();
  await p.goto("/");
  await expect(
    p.getByRole("heading", { name: "Disaster Response and Management System" }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: /^Demo (Citizen|Authority|Rescuer|Admin)$/ }),
  ).toHaveCount(0);
  await p.getByRole("link", { name: /Open Development/ }).click();
  await p.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Session service unavailable; retry connection" },
      }),
    }),
  );
  await p.getByRole("button", { name: "Continue with local account" }).click();
  await expect(
    p.getByRole("alert").filter({ hasText: "Session service unavailable" }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Continue with local account" }),
  ).toBeEnabled();
  await p.unroute("**/api/v1/auth/me");
  await p.getByRole("button", { name: "Continue with local account" }).click();
  await expect(
    p.getByRole("heading", { name: "My reports and assistance" }),
  ).toBeVisible();
  await p.goto("/admin");
  await expect(
    p.getByRole("heading", { name: "Access restricted" }),
  ).toBeVisible();
  await context.close();
});

test("server-driven queue filters, supplementary updates and empty states work with real local data", async ({
  browser,
}) => {
  const citizenContext = await browser.newContext(),
    authorityContext = await browser.newContext();
  const citizen = await login(citizenContext, "Citizen"),
    authority = await login(authorityContext, "Authority");
  const marker = `UI controlled report ${Date.now()}`;
  await citizen.getByRole("link", { name: "Need help", exact: true }).click();
  await citizen
    .getByRole("button", { name: "Medical emergency", exact: true })
    .click();
  await citizen.getByLabel("Latitude", { exact: true }).fill("19.076");
  await citizen.getByLabel("Longitude", { exact: true }).fill("72.8777");
  await citizen.getByLabel("Landmark or address").fill(marker);
  await citizen.getByLabel("Estimated people affected").fill("2");
  await citizen
    .getByLabel("Immediate hazards")
    .fill("Controlled exercise: smoke reported near gate");
  await citizen.getByRole("button", { name: "Submit request" }).click();
  await expect(citizen.getByText("Reported hazards:")).toBeVisible();
  await citizen
    .getByLabel("Add information")
    .fill("Controlled exercise: use the east entrance");
  await citizen
    .getByRole("button", { name: "Add update", exact: true })
    .click();
  await expect(
    citizen.getByText("Controlled exercise: use the east entrance", {
      exact: true,
    }),
  ).toBeVisible();
  await authority
    .getByRole("textbox", { name: "Search incident ID or location" })
    .fill(marker);
  await authority.getByRole("button", { name: "Search", exact: true }).click();
  await expect(authority.locator(".queue-item")).toHaveCount(1);
  await expect(authority.locator(".ops-stat.active strong")).toHaveText("1");
  await authority.getByLabel("Severity", { exact: true }).selectOption("LOW");
  await expect(
    authority.getByRole("heading", { name: "No matching incidents" }),
  ).toBeVisible();
  await expect(authority.locator(".ops-stat.active strong")).toHaveText("0");
  await authority.getByLabel("Severity", { exact: true }).selectOption("HIGH");
  await expect(authority.locator(".queue-item")).toHaveCount(1);
  await expect(
    authority.getByRole("heading", { name: "Incident map", exact: true }),
  ).toBeVisible();
  await expect(
    authority.getByText("Map unavailable", { exact: true }),
  ).toBeVisible();
  await authority.screenshot({
    path: "test-results/operations-desktop.png",
    fullPage: true,
  });
  await citizenContext.close();
  await authorityContext.close();
});

test("revoked sessions leave the protected shell and normal login never falls back to fixtures", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    p = await login(context, "Citizen");
  await p.route("**/api/v1/incidents?**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "SESSION_REVOKED", message: "Session revoked" },
      }),
    }),
  );
  await p.getByRole("button", { name: "Refresh dashboard" }).click();
  await expect(
    p.getByRole("heading", { name: "Disaster Response and Management System" }),
  ).toBeVisible();
  await expect(
    p.getByText("Your session has ended or access was revoked.", {
      exact: false,
    }),
  ).toBeVisible();
  await context.close();
  const secure = await browser.newContext(),
    loginPage = await secure.newPage();
  await loginPage.route("**/api/v1/auth/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        mode: "cognito",
        identityConfigured: false,
        realtime: "poll",
      }),
    }),
  );
  await loginPage.goto("/");
  await expect(
    loginPage.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(
    loginPage.getByRole("link", { name: /Open Development/ }),
  ).toHaveCount(0);
  await loginPage.goto("/development");
  await expect(loginPage.getByLabel("Demo role")).toHaveCount(0);
  await secure.close();
});
