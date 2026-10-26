# response. — Calm field operations

## Scope and audit

This is a presentation/interaction update to the existing React/TypeScript application, not a framework migration. React, React Router, Lucide and MapLibre already existed. No new runtime dependency, backend route, authentication flow, API call, permission rule or schema is introduced by the design pass. Existing IDs, data attributes, route paths, action names and workflow test selectors are retained.

| View or shared pattern | Source |
|---|---|
| Normal sign-in and separate development entry | `apps/web/src/main.tsx` → Landing |
| Shell, role navigation, profile, notifications, emergency notice | `main.tsx` → Shell, Profile, Notifications, EmergencyFallback |
| Citizen report form, report details/history/tracking/dispatch | `main.tsx` → ReportForm, IncidentDetail, Tracking, ReviewTools |
| Teams/resources, announcements, local situation, admin accounts/config/audit | `main.tsx` → Teams, Announcements, Situation, Admin |
| Role overview, incident inbox/history, server filters, summary and activity | `dashboard.tsx` |
| Operational metrics and record tables | `metrics.tsx` |
| Shelters/resources, map picker and operational map | `resource-map.tsx`, `location-picker.tsx`, `operations-map.tsx` |
| Admin forms, organizations/teams, evidence list, inventory, notification attempts | `management.tsx` |
| Shared PageHead, Badge, Empty and ErrorBox | `main.tsx`; dashboard has a local badge renderer |
| Card/panel, stat strip, pills, tables, form, banner, empty/error/loading patterns | `styles.css` (existing structure), `operations.css` (responsive component presentation) |
| Palette/type/spacing/motion definitions | `tokens.css` (single colour source) |
| Third-party map controls/layout | `maplibre-gl/dist/maplibre-gl.css`; application overrides use tokens |

The three implementation stages were tokens/sign-in, shell, then shared page patterns. Build and existing tests were run after each stage. Final validation also covers the new keyboard/navigation/table/theme behaviour; see `docs/TESTING.md`.

## Tokens

`tokens.css` owns all authored application colour literals, including map marker colours resolved through `visual-tokens.ts`. Components use `var(--token)`; never introduce a new hex colour in a component stylesheet. The existing `--navy`/`--coral` names are compatibility aliases, not additional palettes. Vendor map CSS and provider-rendered map tiles remain external styling.

- `--paper`, `--surface`, `--surface-raised`, `--surface-muted`: warm canvas and deliberate tonal layers.
- `--ink`, `--muted`, `--line`: readable text and structural dividers.
- `--sidebar`, `--sidebar-hover`, `--sidebar-text`, `--sidebar-muted`: warm dark navigation in both themes.
- `--accent`, `--accent-hover`, `--on-accent`: vermilion for primary emphasis. `--teal`/`--teal-bg` provide the calm secondary accent.
- Critical, warning, ok and info each have a foreground and background pair. Do not apply a semantic foreground to an arbitrary background without checking contrast.
- `--font-heading`: locally available Iowan/Palatino/Georgia serif. `--font-body`: Segoe UI/Helvetica/Arial. `--font-mono`: Cascadia/SFMono/Consolas. These are system fonts; there is no font CDN or download. Rendering varies slightly by OS.
- `--text-*`: scale from .75rem to responsive display type. Use large serif titles sparingly, body text around 16px, monospace for identifiers/counts/timestamps.
- `--space-*`: 4, 8, 12, 16, 24, 32, 48, 64px. `--radius-sm`/`--radius`/`--radius-pill`: 6px, 12px, pill. Compatibility layout dimensions remain in the existing structural styles.
- `--shadow`, `--shadow-raised`: tonal separation; do not border every panel.
- `--duration-fast` 150ms, `--duration` 240ms, one standard easing curve. Transform/opacity for animation, no animated layout dimensions.

`prefers-color-scheme: dark` remaps the same tokens. `prefers-reduced-motion: reduce` disables animation/transitions, including page transitions and count animation. Contrast checks cover the defined body, semantic, primary and navigation text pairs at WCAG AA 4.5:1; this is not a claim of independent accessibility certification.

## Components and patterns

### Entry

Use an asymmetrical text-led layout. The existing application title remains the H1; one word carries emphasis. The timeline in `presentation.tsx` is labelled **Illustrative response sequence** with an EXAMPLE reference. It never reads or represents live incident data. Its loop pauses on hover/focus, has an explicit pause control and stops under reduced motion. The entry emergency notice is fixed at the bottom with reserved page padding, including on phones. Do not dismiss or obscure the development banner.

Normal Cognito actions retain their URLs. Missing configuration uses a short inline status with a native Details disclosure. Retry retains its existing reload behaviour while exposing a busy indicator. The separate development action remains conditional on the existing backend mode.

### Shell

Desktop navigation uses unique Lucide icons, quiet groups, a filled active state and an inset marker. Collapse is remembered in `localStorage` under `response:sidebar-collapsed`; storage failure is harmless. Collapsed links retain accessible names, hover/focus labels and native title tooltips. Mobile uses a horizontally scrollable bottom bar with labels; all destinations remain reachable.

The top bar contains role context, optional deep breadcrumb, existing dashboard refresh (rendered through a portal), notifications and keyboard help. It does not duplicate the H1. The notification popover uses the existing fetched notification data and never acknowledges a message. The original Notifications link is preserved separately. Native `<details>` handles keyboard disclosure; Escape/outside click closes it.

NavLink's `viewTransition` uses React Router's existing View Transitions integration with ordinary navigation fallback. Reduced motion disables transition animation. Keyboard shortcuts (`g` then `i`, `/`, `?`) are presentation-only, ignore form inputs/modifiers and use the existing routes. The native dialog provides focus containment/Escape and returns focus to its trigger.

### Data and state

Stats are a single divided strip. Counts derive solely from backend values and animate briefly; screen readers get the actual target count. Critical emphasis applies only when the value is positive. No fabricated sparklines/trends are shown because the summary endpoint has no historical series.

Service oversight shows six actual configuration/backlog values with a computed attention count. “Configured” does not mean provider connectivity was verified; the persistent footnote explains this. Test-mode identity/transport and missing evidence/maps require configuration review, not an invented outage.

Use skeletons only while awaiting data. Inline retry errors name the failed view, retain the backend message, expose busy state, and restore focus to the retry or main region. Existing inline errors/confirmations remain authoritative. The toast observer mirrors existing success/error notices with generic text, does not repeat personal data, never sends requests and keeps at most three dismissible notices.

Empty states use a calm illustration/icon, one concrete explanation and an appropriate next action. A zero count remains zero; it is not replaced with a claim that there is no need for assistance.

### Tables, forms and maps

`PresentationTable` wraps the original table children, retaining semantic `<table>/<thead>/<tbody>/<th>/<td>`. Header buttons set `aria-sort`; sorting operates on **already loaded rows only** and never changes API ordering/pagination. Action/detail columns are not sortable. Sticky headers, row hover/zebra treatment and an empty row are shared.

Keep existing top-aligned labels, required fields, backend validation and confirmations. `:user-invalid` supplements native validation visually. Do not replace the current single-page report form with a wizard: its numbered sections remain intact. Status pills always carry text and additional shape cues; simulation has a dashed outline. Operational maps retain actual provider requests, authorization and unavailable messages. Do not invent map positions or hide an integration error under a decorative map.

44px minimum targets apply to buttons, inputs/selects, navigation, map controls, queue actions and disclosures. Checkbox controls use a 44px label target. Focus rings are visible; main has the existing skip-link target. Bottom bars and toasts reserve space for mobile content. New loading/status controls use semantic status/alert and polite announcements where appropriate; the illustrative loop is deliberately not an aria-live stream.

## Files changed

- `tokens.css`: warm light/dark colour pairs, type/spacing/radius/elevation/motion tokens.
- `styles.css`: existing structural rules now reference tokens instead of legacy colour literals.
- `operations.css`: entry, shell, dashboard, form/table/map, mobile, state and motion styling.
- `main.tsx`: entry structure, disclosure, emergency icon/strip, shell controls and presentation wrappers; existing handlers/routes retained.
- `presentation.tsx`: labelled, pausable illustrative response sequence.
- `shell-interactions.tsx`: sidebar preference, notification preview, keyboard shortcut dialog.
- `ui-feedback.tsx`: count/refresh feedback, retries, visible-row table sorting and passive toast presentation.
- `dashboard.tsx`: service grid, stat strip, skeletons, retry feedback and existing refresh control in top bar.
- `metrics.tsx`: shared sortable table presentation.
- `visual-tokens.ts`, map components: resolve marker colours from tokens; same provider/data logic.
- `tests/browser/design.spec.ts`: presentation interaction, sorting and responsive theme/contrast checks. `playwright.config.ts` uses existing test-mode limits for the expanded automation; the original workflow test waits for its saved-update form to finish before checking saved text.
- `scripts/doctor-local.mjs`, `package.json`: read-only local setup diagnostics; no service mutations.
- `LOCAL_TEST_WALKTHROUGH.md`, `START_HERE.md`, status/testing docs: Windows startup and reproducible four-role sample exercise.
- `docs/design-previews/`: screenshots of local fixtures; not real incident data.

## Deliberately outside this visual pass

- Real local password registration or replacing Cognito, unrestricted role creation, and enabling real notifications would change authentication/business logic. Local fixture identities remain explicit; Cognito is still required for real accounts.
- Offline basemap/routing, local evidence object storage and actual email/SMS delivery require provider/storage changes. Their current unavailable/simulated states remain truthful.
- Server-wide table sorting, historical trends, SLA calculations and new real-time endpoints require API/data work. Only the existing queue filters/server sorting and loaded-row table sorting are supplied.
- The report form is one page; converting it to a multi-step wizard would change workflow and selectors. Existing numbered sections and validation are styled instead.
- Toasts mirror existing rendered notices; adding a global mutation-result pipeline would touch request logic.
- Full screen-reader/device certification, native Windows execution and live provider acceptance must be performed separately. Map colours resolve on marker creation/update; an idle provider map may need refresh after an OS theme switch.
