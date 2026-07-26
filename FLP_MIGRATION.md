# Fiori Launchpad Embedding — Migration Tracker

Working document. Update the status marks as you go; this file is the single source of
truth for where the migration stands and what order the remaining work happens in.

## Goal

Make `com.zgp9.fe` a fully embedded SAPUI5 Fiori app in the Fiori Launchpad on
`s40lp1.ucc.cit.tum.de` (client 324), reachable through a semantic object, target
mapping, tile and catalog.

## The decision, and why it forces work

`s40lp1` serves **SAPUI5 1.108.33**. The app is built against **1.149.1**.

FLP bootstraps UI5 once for the whole shell, from the ABAP server. An app cannot bring
its own UI5 version into an existing launchpad page. So embedding means the app must run
on 1.108.33, and the source must not use APIs introduced after it.

Upgrading the server was ruled out: UI5 ships inside the `SAP_UI` software component, so
it is a system-wide Basis upgrade on a shared university training system, and on-prem
`SAP_UI` never shipped anything close to 1.149 regardless.

**Key consequence, do not lose this:** `minUI5Version` is a *floor*, not a pin. Code
written to the 1.108 API surface runs on 1.108 **and** on 1.149 — the APIs being restored
here (`Core.applyTheme`, `getMessageManager`) are deprecated in later 1.x but still
present. So this migration does **not** downgrade the BTP deployment. It constrains the
source API surface only. Both targets keep working from one codebase.

## Status legend

- `[ ]` not started
- `[~]` in progress
- `[x]` done and verified
- `[!]` blocked or needs a decision — see Open Questions

---

## Phase 0 — Baseline

Do not skip. You need to know what was already broken before you change anything.

- [ ] 0.1 Branch from `dev`: `feature/flp-embedding`
- [ ] 0.2 Record a green baseline on 1.149 — run and save the output of:
      `npm run ts-typecheck`, `npm run lint`, `npm run test-unit`
- [ ] 0.3 Note any pre-existing failures here so they are not mistaken for regressions:
      _(paste findings)_

**Gate:** you can state, from saved output, what passed before the migration started.

---

## Phase 1 — Version pins and toolchain

Mechanical. Do it all at once, because its output drives Phase 2.

Every place the version is pinned — 10 sites across 8 files:

| File | Site | 1.149 value → target |
| --- | --- | --- |
| `package.json:29` | `@sapui5/types` | remove; add `@sapui5/ts-types-esm@1.108.54` |
| `tsconfig.json:12` | `types` array | `@sapui5/types` → `@sapui5/ts-types-esm` |
| `ui5.yaml:7` | `framework.version` | `1.108.33` |
| `ui5-deploy.yaml:7` | `framework.version` | `1.108.33` |
| `ui5-dist.yaml:11` | `framework.version` | `1.108.33` |
| `ui5-coverage.yaml:7` | `framework.version` | `1.108.33` |
| `webapp/manifest.json:46` | `minUI5Version` | `1.108.33` |
| `webapp/index.html:14` | CDN bootstrap | see 1.6 |
| `webapp/index-cdn.html:14` | CDN bootstrap | see 1.6 |
| `webapp/test/preview.html:15` | CDN bootstrap | see 1.6 |

- [ ] 1.1 `package.json` — swap the typings package.
      `@sapui5/types` has **no 1.108 build** (it starts at 1.113.0). The 1.108-era package
      is `@sapui5/ts-types-esm`, latest patch `1.108.54`. Different package name, and
      rougher typings than you are used to.
- [ ] 1.2 `tsconfig.json` — point `types` at the new package.
- [ ] 1.3 `framework.version` → `1.108.33` in all four yamls.
- [ ] 1.4 Library declarations — currently inconsistent across the four yamls and the
      manifest. Correct set:
      - **Add `sap.ui.table`** everywhere. `sap/ui/table/TreeTable` is imported at
        `webapp/controller/DetailCompare.controller.ts:3` but the library is declared in
        *neither* manifest nor any yaml. Invisible on the CDN, which serves libraries on
        demand; breaks once the ABAP server is the source. This is a live latent bug.
      - **Remove `sap.suite.ui.microchart`** from `ui5.yaml` and `ui5-coverage.yaml`. It is
        unused — the ScanActivity graph is hand-built from HBox/VBox plus CSS
        (`webapp/view/Home.view.xml:100`, `webapp/css/style.css:338` says so explicitly).
      - Align `ui5-deploy.yaml`'s library list with `ui5.yaml`; they have drifted.
- [ ] 1.5 `webapp/manifest.json` — `minUI5Version` → `1.108.33`, add `sap.ui.table` to
      `sap.ui5.dependencies.libs`.
- [ ] 1.6 **Make local dev actually run 1.108** — highest-leverage step in the migration.
      Today all three HTML bootstraps hardcode `https://ui5.sap.com/1.149.1/...`, so
      `ui5 serve` never serves the framework and `framework.version` has no effect at
      runtime. Without this fix you will not reproduce a single control-drift bug until
      after you deploy.
      Constraint to respect: BTP needs an **absolute** CDN URL, because `mta.yaml:34` runs
      plain `npm run build`, not a self-contained build, so no local `resources/` exists
      in the BTP-served app.
      - Preferred: pin all three bootstraps to `https://ui5.sap.com/1.108.33/...`. All four
        contexts (local, ABAP standalone, BTP, FLP) then agree on one version.
        **Depends on Open Question Q1 — CDN retention of 1.108.33.**
      - Fallback if the CDN dropped it: local dev uses a relative
        `resources/sap-ui-core.js` (tooling-served from `framework.version`), ABAP
        standalone points at `/sap/public/bc/ui5_ui5/resources/sap-ui-core.js`, BTP keeps a
        newer CDN pin. Costs bootstrap divergence between targets — document it.
- [ ] 1.7 `manifest.json:2` — `_version` is `"2.0.0"`. **Unverified** whether 1.108's
      descriptor parser and the ABAP app index accept that value. Check against the
      descriptor schema for 1.108 and lower it if not.
- [ ] 1.8 `npm install`, then `npm run ts-typecheck` → this is the authoritative break list.
      Paste it under Phase 2 before starting to fix.

**Gate:** `npm install` clean, and you have a written list of type errors to work from.

---

## Phase 2 — API fixes

Driven by 1.8's output. Known breaks, both from the ~1.118 core-module split:

- [ ] 2.1 `sap/ui/core/Theming` → `Core.applyTheme()` / theme getter. Three sites:
      - `webapp/Component.ts:4,79,80`
      - `webapp/controller/MainShell.controller.ts:1,109`
      - `webapp/test/unit/controller/MainShell.qunit.ts:5,45` — **stubs `Theming.setTheme`**,
        so the test changes with the source. Easy to forget.
- [ ] 2.2 `sap/ui/core/Messaging` → `sap.ui.getCore().getMessageManager()`.
      `webapp/Component.ts:3,44,137-138`. Note line 44 already casts through `unknown` to
      reach `getMessageModel` — the replacement should be cleaner, not another cast.
- [ ] 2.3 Everything else 1.8 surfaced: _(list here)_
- [ ] 2.4 `npm run lint` and `npm run ui5lint`. Expect noise: `@ui5/linter` pushes *toward*
      the modern APIs you are deliberately reverting. Decide per rule whether to configure
      it down or accept warnings — record the choice, do not silently blanket-disable.

**Gate:** `ts-typecheck` clean, `lint` clean or with a written justification per exception.

---

## Phase 3 — Launchpad embedding code

The app must work both embedded (FLP) and standalone (BTP, ABAP direct URL).

- [ ] 3.1 One `isInLaunchpad()` helper — checks for `sap.ushell.Container` in a single
      place. 3.3 and 3.4 both branch on it; do not scatter `sap.ushell` checks.
- [ ] 3.2 `sap.app.crossNavigation.inbounds` in `manifest.json` — semantic object, action,
      title, icon, signature. Must match the target mapping built in Phase 6.
      Also fill `sap.ui.icons` (currently `{}`) so the tile has an icon.
- [ ] 3.3 Hide the `tnt:ToolPage` header when embedded, keep `SideNavigation`
      (`webapp/view/MainShell.view.xml:10-27`). Its header carries a title, the username,
      a theme toggle and a Logout button — all four duplicated by the FLP shell bar.
      Conditional bind, not a deletion: the standalone URL keeps the full header.
      The theme toggle goes with the header — FLP owns theming via user settings.
- [ ] 3.4 Logout — `webapp/controller/MainShell.controller.ts:114-135`. Currently always
      `window.location.assign("/logout")`, which is the BTP approuter endpoint.
      **This is already broken on the ABAP standalone URL today** — that path 404s there.
      Needs: `sap.ushell.Container.logout()` when embedded, `/logout` on BTP.
      The `redirectToLogout()` seam exists for tests; keep it.
- [ ] 3.5 Stylesheet path — `webapp/Component.ts:91` resolves `css/style.css` against
      `document.baseURI`. Under FLP that is the launchpad's document, not your app root, so
      the stylesheet 404s and the app renders unstyled rather than visibly broken.
      → `sap.ui.require.toUrl("com/zgp9/fe/css/style.css")`.
- [ ] 3.6 Direct hash reads — under FLP the hash is `#SemObj-action&/registries?status=X`.
      - `webapp/controller/MainShell.controller.ts:163` — `window.location.hash.replace(/^#/, "")`
        returns the whole FLP intent, breaking section highlighting.
      - `webapp/controller/RegistryList.controller.ts:58-62` — hand-parses the query off the
        hash, breaking the status filter.
      Both should go through the router / `routeMatched` parameters.
- [ ] 3.7 AI chat — `webapp/services/AiChatService.ts:46,55` post to `/ai/*`, which only the
      BTP approuter serves. There is no host guard, so on ABAP it throws. Hide the feature
      when the routes are absent rather than letting it fail.

**Gate:** app builds and starts; no console errors on the standalone URL.

---

## Phase 4 — Local verification on 1.108

Only meaningful once 1.6 is done. This is where control drift across ~40 releases shows up.

- [ ] 4.1 `npm start` — confirm from the console that the running UI5 really is 1.108.33
- [ ] 4.2 Click through all 13 views: Home, RegistryList, RegistryDetail, VersionDetail,
      ModelExplorer, VersionCompare, DetailCompare, JobList, JobDetail, Logs, MainShell,
      App, Main
- [ ] 4.3 Exercise `sap.f` FlexibleColumnLayout column transitions and `DynamicPage`
      collapse — these existed in 1.108 with fewer properties than 1.149
- [ ] 4.4 Exercise the `sap.ui.layout.Splitter` split views and the responsive breakpoints
      driven by `Component.ts:57-75` (`isPhoneWidth` / `isNarrowWidth`)
- [ ] 4.5 `npm run test-unit` green
- [ ] 4.6 Log every visual or behavioral difference found: _(list here)_

**Gate:** all 13 views usable on 1.108 locally. Do not deploy before this passes — a
server round trip per bug is far slower than finding them here.

---

## Phase 5 — ABAP deploy

- [ ] 5.1 Create a transportable Z package and a transport request (SE80/SE21).
      `ui5-deploy.yaml:38-39` currently targets `$TMP` with an empty transport, which is
      not transportable.
- [ ] 5.2 Update `ui5-deploy.yaml` `app.package` and `app.transport`
- [ ] 5.3 `npm run deploy` — credentials are the on-prem ABAP user (DEV-173 / DEV-257),
      **not** a BTP login
- [ ] 5.4 Verify the standalone URL: `/sap/bc/ui5_ui5/sap/zgsu26gp09_fe_1/index.html`
- [ ] 5.5 Run `/UI2/APP_INDEX_CALCULATE` and `/UI2/INVALIDATE_GLOBAL_CACHES`.
      Required after every deploy, or FLP keeps serving a stale descriptor. Suspect this
      first whenever a manifest change appears to have no effect.

**Gate:** app loads from the ABAP standalone URL.

---

## Phase 6 — Launchpad configuration

Transaction and field names vary slightly by release; adjust to what the system shows.

- [ ] 6.1 Semantic object — `/n/UI2/SEMOBJ`. Must match `crossNavigation.inbounds` (3.2).
- [ ] 6.2 Catalog — `/UI2/FLPD_CUST` (or `/UI2/FLPCM_CUST` on newer releases)
- [ ] 6.3 Target mapping:
      - Semantic object + action from 6.1
      - Application Type: **SAPUI5 Fiori App**
      - URL: `/sap/bc/ui5_ui5/sap/zgsu26gp09_fe_1` (no `index.html` — embedding loads the
        Component, not the page)
      - Component ID: `com.zgp9.fe`
      - Device types: desktop, tablet, phone (manifest declares all three)
- [ ] 6.4 Static app-launcher tile — title, subtitle, icon; navigation target is the
      **intent** from 6.3, not a raw URL
- [ ] 6.5 Group, so the tile appears on a page
- [ ] 6.6 PFCG role carrying catalog + group; assign to DEV-173 / DEV-257
- [ ] 6.7 Open FLP at `/sap/bc/ui2/flp` and launch the tile

**Gate:** tile appears in FLP and opens the app inside the launchpad shell.

---

## Phase 7 — Regression and close-out

- [ ] 7.1 All 13 views again, this time **inside** FLP — 3.5 and 3.6 bugs only appear here
- [ ] 7.2 FLP shell bar present, app header hidden, side nav working (3.3)
- [ ] 7.3 Logout from inside FLP ends the session properly (3.4)
- [ ] 7.4 Back/forward browser navigation across app routes under the FLP hash
- [ ] 7.5 FLP theme switch does not fight the app
- [ ] 7.6 **BTP still works** — the coupling check. `mbt build -p=cf`,
      `cf deploy mta_archives/com.zgp9.fe.mta_1.0.0.mtar`, then verify the app *and* the AI
      chat on the approuter URL. Per the note at the top this should pass unchanged; 7.6 is
      how you find out it didn't.
- [ ] 7.7 Update `README.md`:
      - Add the ABAP/FLP deploy path — currently undocumented
      - Fix line 57, which claims `index.html` loads UI5 from a relative `resources/...`
        path. It hardcodes the CDN.
      - Fix lines 116-121, which claim the AI routes check `$XSAPPNAME.AiUser` via a `scope`
        property in `xs-app.json`. After `123d5ab` no such scope or property exists.

---

## Open questions

- **Q1 — Does the CDN still serve 1.108.33?** Blocks step 1.6's preferred path.
  Check: `curl.exe -k https://ui5.sap.com/1.108.33/resources/sap-ui-version.json`
  (PowerShell 5.1 aliases `curl` to `Invoke-WebRequest`, which has no `-k` — use
  `curl.exe`.) If it 404s, take 1.6's fallback.
  Answer: _(record here)_
- **Q2 — Does 1.108 accept `manifest.json` `_version: "2.0.0"`?** Step 1.7.
  Answer: _(record here)_
- **Q3 — Does `s40lp1` have `sap.ui.table` and `sap.tnt` installed?** Both are standard in
  `SAP_UI` but confirm before assuming; 1.4 declares them and Phase 6 will fail obscurely
  if the server lacks them.
  Answer: _(record here)_
- **Q4 — Spaces/pages or classic groups?** If the system has spaces and pages switched on,
  6.5 becomes a page/space assignment instead of a group.
  Answer: _(record here)_

## Rollback

All Phase 1-3 work is one branch. `git checkout dev` restores the 1.149 build; nothing in
Phases 1-4 touches the ABAP system or BTP. The first irreversible-ish step is 5.3, and even
that only overwrites the existing `ZGSU26GP09_FE_1` BSP application.

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-07-26 | Embed properly (downgrade source to 1.108) rather than a URL-type target mapping | Requirement is an app *on* the launchpad with a real target mapping, catalog and tile; a URL target mapping launches the app but does not integrate it |
| 2026-07-26 | Hide the app's ToolPage header when embedded, keep the side nav | FLP shell bar already provides title, user, theme and logout |
| 2026-07-26 | Do not upgrade `SAP_UI` on `s40lp1` | System-wide Basis upgrade on a shared training system, and on-prem never shipped ~1.149 anyway |
| 2026-07-26 | Keep BTP on the same codebase | `minUI5Version` is a floor; 1.108-compatible source runs on 1.149 unchanged |
