import { test, expect, type Page } from "@playwright/test";
async function admin(page: Page) {
  await page.goto("/development");
  await page.getByLabel("Demo role").selectOption("admin");
  await page
    .getByRole("button", { name: "Continue with local account" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Administration overview" }),
  ).toBeVisible();
}
test("navigation preferences, keyboard guide and notification preview remain usable", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.keyboard.press("/");
  await expect(
    page.getByRole("textbox", { name: "Search incident ID or location" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Search incident ID or location" })
    .fill("gi");
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("textbox", { name: "Search incident ID or location" })
    .blur();
  await page.keyboard.press("g");
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/\/reports$/);
  await page.getByLabel("Preview notifications", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Notification preview" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "Notification preview" }),
  ).not.toBeVisible();
});
test("table sorting changes presentation without dropping rows", async ({
  page,
}) => {
  await admin(page);
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  const rows = page.locator("tbody tr");
  await expect(rows).not.toHaveCount(0);
  await expect(
    page.getByText("citizen@demo.invalid", { exact: true }),
  ).toBeVisible();
  const before = await rows.count();
  await page
    .getByRole("button", { name: "Sort visible rows by Name", exact: true })
    .click();
  await expect(page.locator('th[aria-sort="ascending"]')).toContainText("Name");
  await expect(rows).toHaveCount(before);
  await page
    .getByRole("button", { name: "Sort visible rows by Name", exact: true })
    .click();
  await expect(page.locator('th[aria-sort="descending"]')).toContainText(
    "Name",
  );
});
for (const colorScheme of ["light", "dark"] as const) {
  test(`360px ${colorScheme} theme keeps controls, notices and contrast usable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".demo-banner")).toBeVisible();
    const danger = page.locator(".entry-emergency");
    await expect(danger).toBeInViewport();
    await expect(page.locator(".response-sequence li").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await page.locator(".identity-notice summary").click();
    await expect(
      page.getByText(/Cognito sign-in is not configured/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = (name: string) => {
        const hex = style.getPropertyValue(name).trim().replace("#", "");
        const rgb = [0, 2, 4]
          .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((v) =>
            v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
          );
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return [
        ["--ink", "--paper"],
        ["--muted", "--surface"],
        ["--critical", "--critical-bg"],
        ["--warning", "--warning-bg"],
        ["--ok", "--ok-bg"],
        ["--info", "--info-bg"],
        ["--on-accent", "--accent"],
        ["--sidebar-muted", "--sidebar"],
      ].map(([fg, bg]) => {
        const a = luminance(fg),
          b = luminance(bg);
        return {
          pair: fg + "/" + bg,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
    });
    for (const r of ratios) expect(r.ratio, r.pair).toBeGreaterThanOrEqual(4.5);
    await admin(page);
    for (const route of [
      "/",
      "/reports",
      "/announcements",
      "/situation",
      "/resource-map",
      "/teams",
      "/metrics",
      "/admin",
      "/notifications",
      "/profile",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      if (route === "/admin")
        await expect(
          page.getByText("citizen@demo.invalid", { exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        route,
      ).toBe(true);
    }
  });
}
