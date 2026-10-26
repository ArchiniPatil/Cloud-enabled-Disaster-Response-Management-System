/** MapLibre needs a resolved colour, not a CSS var() expression. */
export function tokenColor(name: "accent" | "teal" | "muted" | "info") {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
}

/** Keep browser chrome in sync without duplicating palette values in HTML. */
export function syncBrowserTheme() {
  const preference = matchMedia("(prefers-color-scheme: dark)");
  const update = () =>
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        getComputedStyle(document.documentElement)
          .getPropertyValue("--paper")
          .trim(),
      );
  update();
  preference.addEventListener("change", update);
  return () => preference.removeEventListener("change", update);
}
