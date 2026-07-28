# Fiori Launchpad Embedding — Migration Tracker

Working document. Update the status marks as you go; this file is the single source of
truth for where the migration stands and what order the remaining work happens in.

---

## ▶ RESUME HERE

**Last updated:** 2026-07-28

**Where things stand:** **the migration is done.** Phases 0–6 are complete and verified inside the
real launchpad; Phase 7 is closed apart from 7.4, half of 7.5, and the 7.7 README tidy-up. 7.6 was
**dropped** — BTP is not going to be used. Phase 4's two role-blocked views are unblocked and
exercised.

> ⚠️ Three statements that stood here through earlier revisions are now **false** and have been
> removed, in case you remember them: that Phase 3 was "not runtime-verified on the embedded path"
> (it is — 7.1), that 3.7 was "deferred to after the migration" (it is closed and the AI chat works
> on every host), and that JobList/JobDetail were blocked on `ScanJob.Execute` (granted; see Q6).

**Branch history:** `6493b72` (init) → `630bf1d` (Phase 1–2) → `4818ee1` (Phase 3) →
`162e324` (Phase 4) → `872e39f` (Phase 5 & 6) → `bc5828c` (Init AI) → `da3504c` (AI Completion).

> ⚠️ **Seven files are uncommitted** as of this update — this file, `manifest.json`,
> `AiChatService.ts`, `BaseController.ts`, `css/style.css`, `VersionCompare.view.xml`,
> `AiChatDialog.fragment.xml`. They carry **four defect fixes verified on the launchpad** (findings
> **H**, **I**, **J** and the 3.7 fragment bug) plus the OpenRouter model swap. The earlier
> UNCOMMITTED warning naming `Launchpad.ts` / `MainShell.controller.ts` / `README.md` is stale —
> that work landed in `bc5828c` / `da3504c`. `git status` is the authority, not this line.

## 🎉 The migration's central goal is met (2026-07-27), and close-out finished (2026-07-28)

**`com.zgp9.fe` runs embedded in the Fiori Launchpad on `s40lp1`, on UI5 1.108.33, reached through
a tile → intent → target mapping → component, with real data and zero console errors of its own.**
As of 2026-07-28 it also runs **full width**, is **legible in the shell's dark theme**, navigates
end to end including DetailCompare, and its **AI assistant works on both providers** — all
confirmed by clicking through the real launchpad rather than by reasoning. See the Phase 3 status
block for the embedding evidence, and findings **H**, **I** and **J** for what live testing caught
that no static check could.

**Done since the last update:** **3.4** decided and deleted, which closes **7.3**. **3.7**
reversed from "hide the AI chat on ABAP" to "make it work" — **the AI chat now works on the ABAP
standalone URL**, verified end to end on 2026-07-28 (200, real answer, clean console). The BE team
installed `ZCL_GP9_AI_PROXY`, the table, both destinations and the ICF node.

✅ **AI chat confirmed working inside FLP, 2026-07-28** — dialog opens, real answer, readable.
**3.7 is closed.** ✅ **Finding H confirmed fixed on the live launchpad**, across Home,
VersionDetail and VersionCompare: **8 elements, all AA PASS, 6.24–15.37:1** — including the diff
rows that measured 1.04 before. That also closes the Quartz half of **7.5**; see finding H for why
`.xmlTokTag` = 6.24 is the proof. ✅ **JobDetail opens with data (4.2).**
No app-side console errors — everything in the FLP console is shell noise (`msplugin`
`Component-preload.js` 404, "Unified Shell Intent" single-valued-parameter warnings,
`sessionTimeoutReminderInMinutes`).

🐞 **User testing then found two bugs that no static check or local run could see — findings I and
J, and they share a root cause.** The launchpad **letterboxes** embedded apps into a ~1280px
centred column (**J** — the app was never opting out with `sap.ui/fullWidth`). Subtract the app's
own side navigation and only ~1040px of content is left, which is less than VersionCompare's 69rem
of fixed column widths — so its Action column was clipped away, taking the *View Detail* button and
**the only route to DetailCompare** with it (**I**). Both fixed and both confirmed on the
launchpad: the app now spans the window, and the compare row navigates.

🐞 **The "3.7 last mile" 30-second check found a real bug — 2026-07-28.** Clicking *Ask AI*
**inside FLP** did nothing: `AiChatDialog.fragment.xml` used the `Dialog` **`footer` aggregation,
which does not exist in 1.108** (added ~1.110). The XML processor then reads `<footer>` as a
control name and 404s on `sap/m/footer.js`, rejecting `Fragment.load` so the dialog never opens.
**Fixed and verified on a running 1.108 page** (see 3.7) — but the fix is **local only, it needs
`npm run deploy` before the FLP check can be repeated.** Note *why* this survived to production:
the ABAP **standalone** URL where 3.7 was verified loads **CDN 1.149**, where the aggregation
exists (1.6), so only the FLP path — the one running 1.108 — could ever have shown it.

✅ **JobList is no longer blocked.** *Scan Job Management* renders **inside FLP** with real job
data, so the `ScanJob.Execute` grant of Q6 has evidently happened. JobDetail and the FCL
two-column transition still need an actual row click — see 7.1 and Q6.

**Next action:** Phase 7. In priority order:
**The launchpad work is done.** Phases 0–6 complete; 3.7, 4.2, 7.1, 7.2, 7.3, 7.6 (dropped) and
findings **H**, **I** and **J** are all verified inside the real FLP. The app runs embedded, full
width, legible in the shell's dark theme, with working navigation and a working AI assistant on
both providers. What is left is small and none of it is embedding:

⚠️ **UNCOMMITTED as of this update** — seven files: `FLP_MIGRATION.md`, `manifest.json`,
`AiChatService.ts`, `BaseController.ts`, `css/style.css`, `VersionCompare.view.xml`,
`AiChatDialog.fragment.xml`. That is four real defects (H, I, J and the 3.7 fragment bug) plus the
model swap, all verified on the launchpad and **none of them committed**. `git status` is the
authority, not this line.

1. **Commit the above.** Everything in it is deployed and confirmed working; the tree is the only
   place the work is at risk.
2. **7.4** — back/forward under the FLP hash. The last untouched Phase 7 item.
3. **7.5 remainder** — only the `applyStoredTheme()` question is left; the finding-H half is
   closed. Run standalone, toggle to light, then open from the FLP tile while the shell is dark.
4. **7.7** — README: the ABAP/FLP deploy path, line 57's CDN claim, the stale
   `$XSAPPNAME.AiUser` scope text.
5. **Housekeeping** — the `ZCL_GP9_AI_PROXY` divergence (below), and deferred finding **B**
   (`archive.zip` and `resources/com.zgp9.fe.zip` are tracked build artifacts that dirty the tree
   on every build; `archive.zip` had to be restored **three times** on 2026-07-28 alone).

⚠️ **The running ABAP class has diverged from the repo copy in four places** — the BE team edited
it during install and never abapGit-pushed, so `SAP09_BE/src/zcl_gp9_ai_proxy.clas.abap` is now
fiction. Checklist for their push is at the end of `SAP09_BE/AI_PROXY_SETUP.md`.

**Phase 5 is done**: deployed to package `ZGSU26GP09` under transport `S40K919517`, out of `$TMP`,
loading from the ABAP standalone URL. 5.5 (app index / cache invalidation) is **deferred by
decision, not outstanding** — read 5.5 before running either report on this shared system.
Notably, 5.5 was never needed: the tile resolved first time without any cache invalidation.

**Phase 6 is done**: semantic object `ZODataServiceRegistry` (6.1), catalog `ZGSU26GP09_FE_CAT`
(6.2), target mapping (6.3), tile (6.4), role `ZGSU26GP09_FE_ROLE` for DEV-173/174/257 (6.6).
6.5 used route (a), `My Home` via the App Finder; the dedicated space and page — route (b), the
version worth writing up — is still open.

Phase 4 is done **except** JobList/JobDetail (4.2) and the FCL two-column transition (4.3), which
are blocked on the `ScanJob.Execute` role — a person, not the migration. Bundle that ask with the
PFCG role 6.6 needs anyway (Q6).

**Phase 4 outcome (2026-07-26):** every view **except JobList and JobDetail** is verified on
1.108 — first unauthenticated with placeholder route ids, then again signed in against real data.
The Splitter and both responsive breakpoints behave. **Three more defects were found and fixed**
beyond the three already in 4.6: two icons that do not exist in the 1.108 font, an unknown `width`
setting on `sap.ui.core.Item`, and a nested aggregation binding missing `templateShareable` —
items 4, 5 and 6. The last two are `[FUTURE FATAL]`, so they would have become thrown errors on a
later UI5 rather than staying warnings.
All three were found by **reading the console on a running 1.108 page**, not by any static check.
If you add views later, that sweep is the step that catches their equivalents.

⚠️ **Blocked, and it needs a person not a code change: DEV-173 lacks `ScanJob.Execute`.** Signed
in, the side nav shows no Jobs entry, so JobList/JobDetail and the app's only FCL two-column
transition cannot be reached. Either get that role granted (or an account that has it) before
Phase 5, or accept those two views reach the launchpad unexercised.

⚠️ **The backend is reachable — earlier notes in this file said otherwise and were wrong.**
`s40lp1` answers with **HTTP 401 + `WWW-Authenticate: Basic`**, not a connection error. Local dev
with data needs the ABAP user typed into the browser's Basic Auth prompt on first load; the proxy
forwards the challenge on purpose so that prompt appears. Note the prompt does **not** appear in a
headless/automation browser pane — it renders the "Logon failed" body instead, so sign in with a
real browser window. See the correction at the end of 4.6.

**Do not** try to finish the local FLP sandbox first. It is abandoned and does not boot — see
3.0 for the full diagnosis and for what was already ruled out. Phase 3 is verified at 7.1
instead.

**To confirm the current state before continuing:**

```
npm run ts-typecheck     # expect: clean, exit 0
npm run lint             # expect: exactly 1 error, Home.controller.ts:133 — PRE-EXISTING, not ours
npm run ui5lint          # expect: exactly 2 errors, both DELIBERATE — see 2.6
npm run test-unit        # expect: 78/82, the 4 pre-existing bucketScanTrend failures
npm start                # opens index-local.html on 1.108.33 — standalone behaviour
```

All four non-interactive checks above were green at `4818ee1`, and the first three were re-run
green after each of the Phase 4 fixes. The Phase 4 changes are all in `.view.xml` files, which
the typecheck and ESLint do not read at all — so for those, **the console on a running page is
the only check that means anything**.

`npm run start:flp` also exists but is **not a state check — it does not work.** The server
starts and every resource serves, but the page hangs in UI5's boot task with an empty console.
See 3.0 before touching it.

Two console errors on `npm start` are expected while **signed out**, and are not regressions:
`GET …/$metadata` and `CSRF fetch failed (502)`. They mean *unauthenticated*, not *unreachable* —
they disappear once the Basic Auth prompt is answered. A third symptom travels with them:
`Route with name login does not exist` plus a "Your session expired" dialog (deferred finding G).

Operational note: `npm start` and `npm run test-unit` both bind port 8080, and the test runner
starts its own server. Stop the dev server before running the tests, or the run fails in
confusing ways.

**Scope note — unit tests are NOT ours.** Another team member owns the QUnit suite. Do not
spend time on the 4 pre-existing `Home – bucketScanTrend` failures (diagnosed in 0.3) or on
making the suite run under 1.108 (closed off in 2.7). Just don't make it worse than 78/82.

**Read before touching code:** the "Key consequence" note below, then Phase 2.3 (why
`webapp/ui5-108-types.d.ts` is shaped the way it is — it looks over-engineered and is not) and
Phase 4.6 (six non-obvious 1.108 traps already hit; three of them fail completely silently).

**Also see "Deferred findings"** near the end: eight issues, mostly pre-existing and unrelated to
this migration but real. Four intersect this plan — **A** must be read before doing 3.4, **B**
explains why `git status` keeps showing a modified `.zip`, **G** explains the "Your session
expired" dialog you will see on every signed-out load, and **H** (now **fixed**) is the two
theming traps in `css/style.css`; read it before putting any colour in that file.

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

- [x] 0.1 Branch — working on **`migration`**, based on commit `6493b72`
- [x] 0.2 Baseline recorded on 1.149, before any migration edit
- [x] 0.3 Pre-existing failures — **not** caused by the migration:

| Check | Result |
| --- | --- |
| `npm run ts-typecheck` | **clean**, exit 0 |
| `npm run lint` | **1 error** — `webapp/controller/Home.controller.ts:133` `@typescript-eslint/no-unnecessary-type-assertion` |
| `npm run test-unit` | **78/82 pass, 4 fail** — all in `Home – bucketScanTrend` |

Notes on both, so they aren't re-diagnosed later:

- The lint error may **change or disappear** under the 1.108 typings — whether an assertion
  is "unnecessary" is a function of the type definitions, so this one is an unreliable
  signal during Phase 2. Judge it on 1.108, not on this baseline.
- The 4 unit failures are **stale tests, not broken source**. `webapp/test/unit/controller/Home.qunit.js:135,144,156`
  treat `ctrl.bucketScanTrend(...)` as an array (`.reduce is not a function`), but the source
  returns `{ points, summary }` — see `webapp/controller/Home.controller.ts:346-348`. The
  tests were never updated when summary stats were added in `c43e3b0
  [FEAT] Enhance ScanActivity Graph`.
  **The QUnit suite is owned by another team member — do not fix these.** Target for Phase 4.5
  is **78/82**, not 82/82; the only obligation is not to make it worse.

**Gate:** ✅ passed — baseline is known and written down.

---

## Phase 1 — Version pins and toolchain

Mechanical. Do it all at once, because its output drives Phase 2.

Every place the version is pinned — 10 sites across 8 files:

| File | Site | 1.149 value → target |
| --- | --- | --- |
| `package.json:29` | `@sapui5/types` | removed; added `@sapui5/ts-types-esm@1.108.33` |
| `tsconfig.json:12` | `types` array | `@sapui5/types` → `@sapui5/ts-types-esm` |
| `ui5.yaml:7` | `framework.version` | `1.108.33` |
| `ui5-deploy.yaml:7` | `framework.version` | `1.108.33` |
| `ui5-dist.yaml:11` | `framework.version` | `1.108.33` |
| `ui5-coverage.yaml:7` | `framework.version` | **left at `1.149.1`** — see 2.7, deliberate |
| `webapp/manifest.json:46` | `minUI5Version` | `1.108.33` |
| `webapp/index.html:14` | CDN bootstrap | **unchanged**, stays CDN 1.149.1 — see 1.6 and the warning in 4.6 |
| `webapp/index-cdn.html:14` | CDN bootstrap | **unchanged**, stays CDN 1.149.1 — same |
| `webapp/test/preview.html:15` | CDN bootstrap | → relative `../resources/`, plus legacy attribute names (4.6) |
| `webapp/index-local.html` | new file | relative `resources/`, legacy attribute names — the 1.108 dev entry point |

- [x] 1.1 `package.json` — `@sapui5/types@1.149.1` → **`@sapui5/ts-types-esm@1.108.33`**.
      `@sapui5/types` has no 1.108 build (starts at 1.113.0). `ts-types-esm` does publish
      `1.108.33`, so the typings match the server runtime patch-for-patch.
- [x] 1.2 `tsconfig.json:12` — `types` array points at `@sapui5/ts-types-esm`.
- [x] 1.3 `framework.version` → `1.108.33` in **three** of the four yamls: `ui5.yaml`,
      `ui5-deploy.yaml`, `ui5-dist.yaml`. `ui5-coverage.yaml` was set to 1.108.33 and then
      deliberately reverted to 1.149.1 — see 2.7.
- [x] 1.4 Library declarations. **Corrected from the original plan — see below.**
      - **Removed `sap.suite.ui.microchart`** from `ui5.yaml` and `ui5-coverage.yaml`.
        Unused: the ScanActivity graph is hand-built from HBox/VBox plus CSS
        (`webapp/view/Home.view.xml:100`, `webapp/css/style.css:338` says so explicitly).
      - **Did NOT add `sap.ui.table`.** The original plan called this a live latent bug.
        That was wrong. `sap/ui/table` appears **0 times** in `dist/Component-preload.js`
        and is elided from the built controller, because the import was only ever used in a
        type position (`as TreeTable`). The library never loads at runtime, so declaring it
        would have added a real dependency to satisfy a phantom one.
      - `ui5.yaml` and `ui5-deploy.yaml` library lists are now **verified identical**
        (`sap.f`, `sap.m`, `sap.tnt`, `sap.ui.core`, `sap.ui.layout`, `themelib_sap_horizon`);
        the earlier drift was the microchart entry, now gone from both.
      - Instead **fixed the mislabelled type** in `DetailCompare.controller.ts`. The cast
        claimed `sap.ui.table.TreeTable`, but the code calls `getBinding('items')` and
        `attachEventOnce('updateFinished')` — `sap.m.Tree`/`ListBase` members;
        `TreeTable` uses a `rows` aggregation. It compiled only because both inherit from
        `ManagedObject`. Now `import type Tree from 'sap/m/Tree'` + `as Tree`.
- [x] 1.5 `webapp/manifest.json` — `minUI5Version` → `1.108.33`. No `sap.ui.table` added,
      per 1.4.
- [x] 1.6 **Local dev now actually runs 1.108.** Q1 came back negative — `ui5.sap.com` does
      not host 1.108.33 (it served the Demo Kit `static404` page), so the fallback applies.
      It turned out to be the better path anyway: `framework.version` resolves through SAP's
      **artifact registry**, a different channel from `ui5.sap.com`, so the tooling serves
      1.108.33 itself with no CDN involvement.
      Implemented:
      - New `webapp/index-local.html` bootstraps from the relative `resources/sap-ui-core.js`,
        which `@ui5/server` supplies at the pinned `framework.version`.
      - `npm start` now opens `index-local.html`. The old CDN-1.149 entry is kept as
        `npm run start:cdn-latest` for comparing behaviour between versions.
      - Excluded from the build in `ui5.yaml`, since `resources/` exists on neither the ABAP
        repository nor the BTP html5-apps-repo.
      - `index.html` and `index-cdn.html` **deliberately untouched**, so BTP and the ABAP
        standalone URL behave exactly as before. This avoids touching `xs-app.json`
        `welcomeFile` mid-migration, which would have put the working BTP deployment at risk.
      - ~~Free win: the QUnit suite runs on 1.108 automatically via its relative bootstrap.~~
        **Retracted.** This looked true — `webapp/test/Test.qunit.html` does bootstrap
        relatively — but the 1.108 test starter cannot locate the testsuite at all in an
        application-type project. See 2.7. The suite runs on 1.149 instead.
      - Known divergence, accepted: the ABAP **standalone** URL still loads 1.149 from the
        CDN while FLP runs 1.108. FLP is the target, standalone is only a debugging
        convenience. To align it later, point `index.html` at
        `/sap/public/bc/ui5_ui5/resources/sap-ui-core.js` — but that path is ABAP-only and
        would break BTP, so it needs the `welcomeFile` split first.
- [x] 1.7 ✅ **Closed 2026-07-27 — leaving it unchanged was correct.** FLP resolved and launched the
      component with `_version: "2.0.0"` intact (6.7), and `/UI2/APP_INDEX_CALCULATE` never had to
      run. The contingency below is now void: **do not lower `_version`.** The `fiori deploy`
      warning at 5.3 is advisory. See Q2.
      `manifest.json:2` `_version: "2.0.0"` — **deliberately left unchanged.** I could
      not establish which descriptor schema versions 1.108 accepts, and guessing a lower
      value risks introducing a problem rather than fixing one. The UI5 runtime warns on an
      unknown `_version` rather than failing, so the real risk surface is the ABAP app index.
      **Re-check at Phase 5.5:** if `/UI2/APP_INDEX_CALCULATE` errors on this app, or FLP
      cannot resolve the component despite a correct target mapping, lower `_version` and
      re-run. Recorded as Q2.
- [x] 1.8 `npm install` clean (exit 0). `npm run ts-typecheck` → **32 errors**, listed in
      Phase 2.3.

**Gate:** ✅ passed — install clean, break list written down.

---

## Phase 2 — API fixes

1.8 produced **32 errors across 12 files**, from four distinct causes.

**The headline: only 4 of the 32 are real runtime API differences.** The other 28 are
typings-shape differences — constructs the 1.108 `.d.ts` files organise differently or do not
generate at all. They say nothing about whether the app *runs* on 1.108. The original estimate
of "four files" was right about runtime APIs and wrong about scope, because the typings package
differs far more between 1.108 and 1.149 than the runtime does.

| # | Cause | Errors | Runtime risk | Item |
| --- | --- | --- | --- | --- |
| C1 | Generated `Control$EventName` event types absent before ~1.115 | 14 | none — type-only | 2.3 |
| C2 | `Theming` / `Messaging` modules (post-~1.118 core split) | 4 | **real** | 2.1, 2.2 |
| C3 | Namespace-vs-property typings shape | 3 | none — type-only | 2.4 |
| C4 | `sap/ui/test/starter/config` types absent | 1 | none — test-only | 2.5 |
| C5 | `attach*` handlers typed as bare `Function`, so callbacks get no contextual type | 8 | none — type-only | 2.6b |

(The first triage counted C5's 8 errors as knock-on effects of C1, making C1 look like 22. They
are independent — see 2.6b.)

**C2 — the two genuine runtime breaks**, both from the ~1.118 core-module split. Fix these
first; they are the only items here that would fail on the launchpad rather than merely fail
to compile:

- [x] 2.1 `sap/ui/core/Theming` → `Core.applyTheme()` / `Core.getConfiguration().getTheme()`. Three sites:
      - `webapp/Component.ts:4,79,80`
      - `webapp/controller/MainShell.controller.ts:1,109`
      - `webapp/test/unit/controller/MainShell.qunit.ts:5,45` — **stubs `Theming.setTheme`**,
        so the test changes with the source. Easy to forget.
- [x] 2.2 `sap/ui/core/Messaging` → `Core.getMessageManager()`.
      `webapp/Component.ts:3,44,137-138`. The old line 44 cast through `unknown` to reach
      `getMessageModel`; the replacement needs no cast at all.
      Also **removed `Component.getMessageManager()`** — it returned `typeof Messaging` and had
      no callers anywhere in `webapp/`, so it was dead code sitting directly on the migration
      path. Deleting it was cheaper than re-typing it.
- [x] 2.3 **C1 — missing event types (14 errors, 9 controllers).** The generated
      `Control$EventName` parameter types do not exist in 1.108; `ListBase$ItemPressEvent`
      appears **0 times** in the whole typings package. Affected names:
      `ListBase$ItemPressEvent`, `ListBase$SelectionChangeEvent`,
      `Route$PatternMatchedEvent`, `Router$RouteMatchedEvent`,
      `ViewSettingsDialog$ConfirmEvent`.
      14 `TS2614`/`TS2694` errors. (The 8 `TS7006` errors initially lumped in here are a
      separate cause — see 2.6b.)
      Files: `DetailCompare`, `Home`, `JobDetail`, `Logs`, `MainShell`, `ModelExplorer`,
      `RegistryDetail`, `RegistryList`, `VersionCompare`, `VersionDetail`.
      **Done via one shim, not nine rewrites:** `webapp/ui5-108-types.d.ts`.
      Two corrections to the original plan, both found by iterating against the compiler and
      linter rather than by reasoning:
      - **Aliasing to plain `Event` is not enough — it is actively harmful.** `type X = Event`
        compiles, but the codebase's idiom is `(event as Route$PatternMatchedEvent)`, which
        then becomes `Event as Event` and trips `no-unnecessary-type-assertion`; and
        `getParameter()` returning `any` cascades into the `no-unsafe-*` rules. That version
        produced **34 ESLint errors against a baseline of 1**. Fixed by declaring each as an
        interface with typed `getParameter` overloads.
      - **Overloads alone still are not enough.** Because the inherited `getParameter` returns
        `any`, an interface that only adds overloads is *structurally identical* to `Event`, so
        TypeScript still saw those 14 casts as no-ops. Each interface therefore carries a
        required type-only `__ui5EventBrand` to make it nominally distinct. Final state: 0
        typecheck errors, ESLint back to the 1 pre-existing error.
      - The file must stay **ambient** (no top-level `import`; every import sits inside its
        `declare module` block). A top-level import makes it a module, which turns each block
        into an augmentation — and an augmentation cannot declare a module that does not
        exist, which item 2.5 requires.
- [x] 2.4 **C3 — namespace-vs-property typings shape (3 errors).** No shim needed — 1.108
      declares these as **named exports** rather than members of the default export, so named
      imports fix them:
      - `Component.ts:100` `Device.support.touch` → `sap/ui/Device` default-exports an empty
        `interface Device {}`, with `support` as a sibling `export namespace`
        (`types/sap.ui.core.d.ts:41043`). Fix: `import { support } from 'sap/ui/Device'`.
      - `DetailCompare.controller.ts:253,255` `MessageBox.Icon` / `MessageBox.Action` →
        `export enum Action` and `export enum Icon` exist at `types/sap.m.d.ts:49670` and
        `:49711`, just not as members of the default export. Imported as
        `{ Icon as MessageBoxIcon, Action as MessageBoxAction }` — aliased to avoid any
        collision and to keep the call sites readable.
      Runtime is unaffected either way; `sap.ui.Device.support.touch` and `MessageBox.Icon`
      both exist in 1.108.
- [x] 2.5 **C4 — `sap/ui/test/starter/config` (1 error).**
      `webapp/test/testsuite.qunit.ts:1`. Declared in the same ambient shim file. Type-only, so
      Babel elides the import and nothing changes at runtime.

- [x] 2.6b **A fourth cause the original triage missed: untyped handler signatures (8 errors).**
      The original plan filed the 8 `TS7006 implicitly has an 'any' type` errors as knock-on
      effects of C1. They are not. In 1.108, `attachPatternMatched` / `attachRouteMatched` are
      typed as taking a bare `Function`, so the callback parameter never receives a contextual
      type — independent of whether the event types exist.
      Fixed by annotating each callback explicitly, which the shim now makes resolvable:
      `.attachPatternMatched((event: Route$PatternMatchedEvent) => {` across 7 controllers, and
      `attachRouteMatched((event: Router$RouteMatchedEvent) => {` in `MainShell`.
      `MainShell` also gained a named `import type { Router$RouteMatchedEvent }`, replacing an
      inline `import("…").Router$RouteMatchedEvent` at what was line 66, so it now matches how
      the other seven controllers declare the same thing.
- [x] 2.6 `npm run lint` → back to the 1 pre-existing baseline error. `npm run ui5lint` → 6
      errors, reduced to 1.
      `@ui5/linter` 1.23.1 supports `ui5lint-disable` / `ui5lint-disable-next-line` with a
      `-- reason` suffix, but its config file offers only file-level `ignorePatterns` — there is
      **no per-rule disabling**. So:
      - The 5 `no-deprecated-api` hits (`getMessageManager`, `getConfiguration`, `getTheme`,
        `applyTheme` ×2) got targeted `ui5lint-disable-next-line` directives, each naming 1.108
        as the reason. Per-site rather than per-file, so the rule still catches genuine future
        deprecations in those files.
      - `no-legacy-ui5-version-in-manifest` ("use 1.136.0 or higher") is **left reporting on
        purpose.** It cannot be disabled per-rule, and silencing it would mean ignoring
        `manifest.json` wholesale and losing unrelated manifest checks. It is a true statement
        about a deliberate, permanent constraint, so it stands as a standing reminder.
        `npm run ui5lint` therefore exits 1 by design; it is advisory and not part of `npm test`.
      - **Correction (2026-07-26, during Phase 3):** the "1 error" figure above is stale.
        `npm run ui5lint` reports **2 errors**, and has since Phase 4.6. The second is
        `synchronizationMode` on the ODataModel — added deliberately in 4.6 item 2 because
        1.108 *requires* it, and flagged by the linter precisely because later versions
        deprecated it. Same situation as the version floor: a true finding about a deliberate,
        permanent constraint. **Expect 2, not 1.** Verified against `HEAD` (`630bf1d`), so it is
        not something Phase 3 introduced.

- [x] 2.7 **Test harness: `ui5-coverage.yaml` deliberately stays on 1.149.1.**
      Running the QUnit suite on 1.108 does not work and is not worth making work. 1.108's
      `createSuite.js` derives a base URL from its own `src` and loads the testsuite as a plain
      script at `<resourcesRoot>/../test-resources/<namespace>/…`, bypassing resource roots
      entirely; it also rejects any suite name outside `test-resources/` with "Invalid test
      suite name". An application-type project does not serve `/test-resources/<namespace>/`
      (nor `/resources/<namespace>/`), so the suite 404s and the runner reports "No test page
      found". Fixing it needs a static middleware mapping that URL onto `webapp/test`.
      Not worth it: these are controller-logic tests built on sinon stubs and never exercised
      UI5 control rendering, so almost no coverage is lost. 1.108 rendering is verified by
      running the app itself (4.1–4.4).
      Two dead ends recorded so they are not retried: adding `id="sap-ui-bootstrap"` to the
      test HTMLs, and renaming the suite to `test/testsuite.qunit`. Both were reverted —
      `git checkout` restored those two files exactly, and the suite returned to its baseline.

**Gate:** ✅ passed.

| Check | Before migration | After Phase 2 |
| --- | --- | --- |
| `ts-typecheck` | clean | **clean** |
| `lint` | 1 error (pre-existing) | **1 error — the same one** |
| `ui5lint` | not run | 1, deliberate (see 2.6) |
| `test-unit` | 78/82 | **78/82, same 4 pre-existing failures** |
| App renders on 1.108 | n/a | **yes** (see Phase 4) |

---

## Phase 3 — Launchpad embedding code

The app must work both embedded (FLP) and standalone (BTP, ABAP direct URL).

## ✅ Status: VERIFIED IN THE REAL LAUNCHPAD, 2026-07-27

**The app runs embedded in the FLP on `s40lp1`, on UI5 1.108.33, with zero console errors of its
own.** 3.1, 3.2, 3.3, 3.5 and 3.6 are all confirmed against the live launchpad — see each item.
**3.4 is the exception and it is a real finding, not a pass:** its embedded branch turns out to be
unreachable. Read 3.4.

The history matters, because the plan very nearly failed here. The local sandbox built to exercise
these paths never booted (3.0), so every `isInLaunchpad()`-true branch — hidden header, ushell
logout, FLP-shaped hash — reached the launchpad **completely unexercised**, and by decision
(option (b), 2026-07-26) was verified for the first time in production. That bet paid off: of the
five branches that finally executed, **four were correct on the first run** and the fifth was
wrong in a way no amount of local sandbox testing would have caught either — it is a wiring
problem between two items, not a bug inside one.

What was confirmed on first execution:

| Item | Evidence from the live launchpad |
| --- | --- |
| 3.1 | `isInLaunchpad()` returned **true** for the first time in any running code |
| 3.2 | The intent resolved: URL hash `#ZODataServiceRegistry-manage`. All four spellings agree |
| 3.3 | No app header at all on desktop — no title, user, theme toggle or Logout. Side nav intact |
| 3.5 | **`css/style.css` → 200**, initiator `Component.ts:103`. The `toUrl` fix works |
| 3.6 | Reload on `…&/registries?status=A` came back filtered to ARCHIVE, 0 items |
| — | Data loads on the FLP session with no separate login: 4 registries, 24 scans |

Console on first run contained **7 errors, none from `com.zgp9.fe`**: four from
`sap.suite.ui.commons.collaboration.flpplugins.msplugin` (the Teams collaboration plugin, broken
on this system — "No descriptor was found" plus a 404 on its `Component-preload.js`), one
`sessionTimeoutReminderInMinutes` shell misconfiguration, `favicon.ico`, and `ushell/resources`
404s. All belong to the launchpad, in the same category as the `SAP_TC_SCM_MPE_COMMON` catalog
error at 6.2. Do not spend time on them.

Static checks were green throughout: `ts-typecheck` clean, `lint` at the 1 pre-existing error,
`ui5lint` at its 2 deliberate ones, `test-unit` at 78/82.

- [!] 3.0 **Local FLP sandbox — ABANDONED, does not boot. Do not restart this without reading
      the whole item.** The infrastructure works; the boot handshake does not.
      **Symptom:** page title appears, body stays blank, spinner runs forever, console is
      *completely empty* — no error, no failed request, no rejected promise.
      **Diagnosis (confirmed):** `sandbox.js` hijacks UI5's boot sequence by assigning
      `window["sap-ui-config"] = { "xx-bootTask": … }`. Core initialisation blocks on that task,
      which does an async `sap.ui.require([… "sap/ushell/Container"])`. If that require never
      settles, `fnCallback` is never invoked and Core waits forever. UI5's loader neither
      rejects nor logs on this path, hence the clean console — the same silent-failure shape as
      4.6 trap 1.
      **Ruled out with evidence — do not re-check:** every resource returns HTTP 200
      (`flpSandbox.html`, `sandbox.js`, `sap/ushell/Container.js`, `Renderer.js`,
      `adapters/local/ContainerAdapter.js`, `Component.js`); `ui5-middleware-sap-proxy`
      intercepts only `/sap/opu/odata4/…`, `/ai/*` and `/logout` and calls `next()` otherwise;
      and none of this app's own code has run yet, since no Component is ever created.
      **Still unknown:** *which* module in the Container chain fails to settle. Anyone resuming
      should instrument the require, or diff against a Fiori-tools-generated `flpSandbox.html`
      for 1.108 rather than reasoning from first principles as was done here.
      **Cost/benefit, recorded honestly:** this was a timeboxed bet on catching 3.3/3.5/3.6
      bugs locally, as 1.6 did for 4.6. It overran its box and did not pay off. Phase 3 is
      verified inside the real launchpad at 7.1 instead — option (b).
      Files are kept, not deleted, because the sound half is reusable: `sap.ushell@1.108.33`
      resolves and installs from the artifact registry, and the whole library serves. Only the
      handshake is unsolved. `ui5-flp.yaml` and `flpSandbox.html` both carry the warning inline.

      Original design notes follow, still accurate for everything except that it boots:
      Without a `sap.ushell.Container` the 3.3/3.5/3.6 paths are simply unreachable locally,
      so every embedding bug would have cost an ABAP deploy cycle to find. Same argument as
      1.6, which paid for itself three times over in 4.6.
      - `webapp/test/flpSandbox.html` — boots `sap/ushell/bootstrap/sandbox.js`, then
        `sap.ushell.Container.createRenderer().placeAt("content")`. Uses `createRenderer()`,
        not `createRendererInternal()`, which arrived long after 1.108. Registers the app
        under the intent `ZODataServiceRegistry-manage`, so **the semantic object now appears in a
        fourth place** — keep it in step with 3.2, 6.1 and 6.3.
      - `ui5-flp.yaml` — a serve-only config whose only difference from `ui5.yaml` is that it
        declares `sap.ushell`. **Deliberately not added to `ui5.yaml`:** that would pull
        `sap.ui.comp`, `sap.ui.table`, `sap.ui.mdc`, `sap.suite.ui.commons`, `sap.viz` and a
        dozen more in as declared project dependencies — precisely the mistake avoided in 1.4.
        On the real launchpad the shell supplies `sap.ushell`; the app must never declare it.
      - `npm run start:flp`, plus a matching `ui5-flp-sandbox` entry in `.claude/launch.json`.
        Excluded from the build in both yamls, like `index-local.html`. Both now point at a
        page that does not boot — see the warning at the top of this item.
      - ⚠️ **First run downloads well over a gigabyte** into `~/.ui5` (about 20 packages —
        `sap.ushell` pulls most of the distribution). It is a one-time cache fill, but it is
        far slower than any tooling start-up timeout, so a preview/dev-server wrapper that
        kills slow starts will appear to fail. Warm the cache first with
        `npx ui5 tree --config ui5-flp.yaml`, then start the server.
      - ⚠️ **The page is very heavy on first load, and this cannot be fixed by building.**
        `/resources/sap/ushell/library-preload.js` **404s under `ui5 serve`**: the SAPUI5 npm
        packages ship source only (`@sapui5/sap.ushell/1.108.33/src`, no bundles), and an
        application `ui5 build` builds only this project — `generateComponentPreload` covers
        `com.zgp9.fe`, never the framework. So the browser fetches `sap.ushell` module by
        module, which is thousands of requests.
        Consequences: use a **real browser**, where the HTTP cache makes the second load
        cheap. An embedded/automation browser pane was tried and its renderer went
        unresponsive every time the page loaded, while a plain directory listing on the same
        server responded fine — the module count, not a fault in these files (every resource
        was independently confirmed to serve: `sandbox.js` 17 KB, `Renderer.js` 122 KB, both
        HTTP 200).
        If the load time ever becomes intolerable, the escape hatch is `ui5 build --all`,
        which builds framework dependencies and emits their preload bundles — at the cost of a
        multi-gigabyte build. Not needed for occasional Phase 3/7 checks; recorded so it is
        not re-derived.
      - Scope limit, do not overclaim it: the sandbox gives a real `Container`, an
        intent-shaped hash and a shell bar. It does **not** reproduce s40lp1's catalog, target
        mapping, roles or theme defaults. Phase 7.1 inside the real FLP is still required.
- [x] 3.1 ✅ **Verified in FLP 2026-07-27** — returned true, proven by 3.3's header disappearing.
      One `isInLaunchpad()` helper — `webapp/services/Launchpad.ts`. Exports
      `isInLaunchpad()` and `logoutFromLaunchpad()`; every `sap.ushell` access in the app is
      confined to that file.
      Typing note: `@sapui5/ts-types-esm@1.108.33` ships `sap.ushell.d.ts`, but it declares the
      `sap.ushell.services.Container` *class* and never declares the global singleton
      `sap.ushell.Container` as a value — and that class's own member is generated as
      `logout: undefined`, so it is unusable even once reached. Declaring the single member
      actually called is smaller and more honest than fighting the generated types, and it
      keeps `ui5-108-types.d.ts` restricted to the 1.108 downgrade.
      The result is also surfaced once as `ui>/isInLaunchpad` (`webapp/model/models.ts`), so
      views bind a flag instead of doing their own detection.
- [x] 3.2 ✅ **Verified in FLP 2026-07-27** — the tile resolved the intent and the hash read
      `#ZODataServiceRegistry-manage`, so manifest, `/n/UI2/SEMOBJ`, target mapping and tile all
      match character for character.
      `sap.app.crossNavigation.inbounds` in `manifest.json` — **`ZODataServiceRegistry` /
      `manage`** (Q5), with title, subtitle, icon and an empty-parameter signature at
      `additionalParameters: "allowed"`. `sap.ui.icons` filled with
      `sap-icon://business-objects-experience`, matching the Registry side-nav entry.
      Must match the target mapping built in Phase 6.
- [x] 3.3 ✅ **COMPLETE — both widths verified in FLP.** Desktop 2026-07-27 (app header entirely
      absent, side navigation working); **phone at 400px on 2026-07-28** (header reappears with
      only the menu button, side nav collapsed, tiles stacked). See 7.2. Original text follows.
      ✅ **Desktop verified in FLP 2026-07-27** — the app header is entirely absent and the
      side navigation (Home / Registry Management / Logs) works. ~~**Phone width below 600px is
      still unverified in FLP**~~ — that is 7.2, and it is the half of this item where the
      non-obvious decision lives, so leave it `[~]` until checked.
      Hide the `tnt:ToolPage` header when embedded, keep `SideNavigation`.
      Conditional bind, not a deletion: the standalone URL keeps the full header.
      **Correction to the plan — it counted four duplicated controls and there are five.**
      The title, username, theme toggle and Logout button are all duplicated by the FLP shell
      bar and are hidden individually. The **menu button is not**: below 600px the side
      navigation collapses to an overlay (`MainShell.onInit`) and that button is the only way
      to reopen it, so hiding the whole header would leave an embedded phone user with no
      navigation at all.
      Implemented as: header visible when `!isInLaunchpad || isPhoneWidth`; the four
      duplicated controls each bound to `!isInLaunchpad`. Desktop FLP therefore shows no app
      header at all, phone FLP shows a header carrying only the menu button.
      Consequence accepted: on desktop FLP the side nav can no longer be collapsed. It is
      visible and fully usable, just not dismissible — a convenience, not a function.
- [x] 3.4 ✅ **RESOLVED 2026-07-27 — deleted, per the finding below.** `logoutFromLaunchpad()`
      and the `UshellContainer` interface that existed only to type it are gone from
      `webapp/services/Launchpad.ts`; `redirectToLogout()` in `MainShell.controller.ts` no longer
      branches and its import of `isInLaunchpad` is removed. `isInLaunchpad()` itself stays — 3.1
      and 3.3 depend on it — and `UshellGlobal.Container` is now typed `object`, since only its
      *presence* is ever read. Both files carry a comment pointing back here so the next reader
      does not "restore" the branch.
      Verified after: `ts-typecheck` clean, `lint` at the 1 pre-existing error, `test-unit` 78/82.
      Consequence for **7.3**: closed as not applicable — logout in FLP is the shell's job.
      Note a pre-existing gap this deletion neither caused nor fixed: on the **ABAP standalone**
      URL `/logout` does not exist (it is an approuter endpoint), so that host 404s on logout.
      The original finding, kept because the reasoning is the useful part:
      ⚠️ **FINDING, 2026-07-27: the embedded branch is unreachable.**
      `logoutFromLaunchpad()` can never run as currently wired. `redirectToLogout()` has exactly
      one caller — `onLogout()` (`MainShell.controller.ts:125`) — and `onLogout` is reached only
      from the Logout button at `MainShell.view.xml:49`, which 3.3 binds
      `visible="{= !${ui>/isInLaunchpad} }"`. **The only control that triggers the embedded branch
      is hidden precisely when that branch would be taken.** 3.3 and 3.4 are individually correct
      and jointly contradictory — which is why no amount of local sandbox testing would have found
      it; it needed someone to read the two items together.
      **Not user-facing.** Logout in FLP works through the shell bar's avatar menu, which is the
      launchpad's own logout and is what should happen — the app has no business ending an FLP
      session. So the defect is dead code plus a mis-specified test item, not broken behaviour.
      **Consequence for 7.3:** as written it cannot be tested. There is no app-side logout to test
      inside FLP. Rewrite or close it; do not go hunting for a bug in `Launchpad.ts`.
      **Options, unresolved:**
      - **Keep** the branch as a deliberate seam for a future programmatic logout (session expiry
        is the obvious candidate — see deferred finding **G**, where `ErrorHandler` currently does
        a `navTo("login")` to a route that does not exist). Document it as intentionally
        unreachable so the next reader does not "fix" it.
      - **Delete** the branch, `logoutFromLaunchpad()`, and the hand-written `sap.ushell` interface
        in `Launchpad.ts` that exists only to type it — the same call already made for
        `MainShell.getCurrentHash()` in 3.6, where dead code was deleted rather than made
        FLP-safe. `isInLaunchpad()` itself stays; 3.1 and 3.3 depend on it.
      Original design: `logoutFromLaunchpad()` when embedded,
      `window.location.assign("/logout")` on BTP. The `redirectToLogout()` seam is
      kept; `MainShell.qunit.ts:58` stubs it, so the branch never runs under the test runner.
      The stale comment was rewritten: per deferred finding **A** the live config is
      `approuter/xs-app.json` with `logoutPage: "/logout.html"`, not the root `xs-app.json`'s
      `"/"`. Confirmed from `mta.yaml:5-11`, which deploys a **standalone** approuter module —
      so the root file, though bundled into the app zip by `ui5-task-zipper`, is not what
      serves. Deduplicating the two files is still open; it touches the BTP bundle and was
      deliberately left out of this branch.
- [x] 3.5 ✅ **Verified in FLP 2026-07-27** — `css/style.css` returned **200** with initiator
      `Component.ts:103` in the network tab. Checked as a status code, not by eye: a 404 here
      renders the app *unstyled* rather than broken, so "it looks fine" is not the test.
      Stylesheet path — `webapp/Component.ts` now uses
      `sap.ui.require.toUrl("com/zgp9/fe/css/style.css")` instead of resolving against
      `document.baseURI`, which under FLP is the launchpad's document rather than the app root.
- [x] 3.6 ✅ **Verified in FLP 2026-07-27.** Clicked the Home *Archived* tile → hash became
      `#ZODataServiceRegistry-manage&/registries?status=A` → **full page reload (F5)** on that hash
      → the Status filter came back as ARCHIVE with 0 items. So `HashChanger.getInstance()`
      correctly reported only the app-internal part of a two-part FLP hash, which is the entire
      point of the fix. See the testing traps recorded at 7.1 before re-running this.
      Direct hash reads. **Only half of this item was a real bug.**
      - `MainShell.controller.ts` `getCurrentHash()` was **dead code** — declared and never
        called anywhere in `webapp/` (one grep hit, the declaration itself). Section
        highlighting has always run off `onGlobalRouteMatched` and route parameters, which is
        already FLP-correct. **Deleted rather than fixed**; there was nothing to fix.
      - `RegistryList.controller.ts` `applyStatusFromCurrentHash()` was real. It is called from
        `onInit` to catch a deep link before the first `patternMatched` fires. Now reads
        `HashChanger.getInstance().getHash()` rather than `window.location.hash`: the shell
        replaces UI5's `HashChanger` with one that reports only the app-internal part
        (`registries?status=Published`) instead of the whole intent, so the first `?` found
        belongs to the route rather than to the intent's own parameters. Identical behaviour
        standalone, where the two are the same string.
- [x] 3.7 ✅ **CLOSED 2026-07-28 — the AI chat works on every host, including embedded in FLP,
      on both providers.** Standalone ABAP verified 2026-07-28; FLP-embedded verified the same day
      after the fragment fix below; Groq and OpenRouter both exercised explicitly. Full history
      follows — it is worth reading, because two of the three defects in it were invisible to every
      static check.
      AI chat on ABAP — **plan reversed 2026-07-27: make it WORK, not hide it.**
      ✅ **WORKING on the ABAP standalone URL, verified end to end 2026-07-28.** One POST to
      `/sap/bc/zgp9_ai/groq/chat/completions` → **200**, 353 kB, 3.91 s, a real answer rendered
      from live `/IWBEP/COMMON` metadata, and no AI error in the console. The six-failure
      fallback cascade recorded at 5.4 is gone.
      **Only FLP-embedded remains unverified** — low risk (the host check has a backstop clause
      specifically for it, see below) but not yet observed, so this stays `[~]`.
      **The original problem.** `webapp/services/AiChatService.ts` posted to hardcoded `/ai/*`
      paths, which only the BTP approuter and the local proxy serve. On ABAP nothing served them,
      so it 404'd. ✅ Confirmed at 5.4 as `AI request failed (404)`; a single click fires **six**
      POSTs — three to `/ai/groq/chat/completions`, then three to `/ai/openrouter/chat/completions`
      — because the model fallback chain retries each before giving up.
      ⚠️ **Superseded: the 2026-07-26 decision was to *hide* the feature on ABAP** via an origin
      check. That is no longer the plan. If you find notes describing a guard that disables the AI
      chat outside BTP, they are stale — the decision log entry for that date is superseded by the
      2026-07-27 one.
      **What replaced it.** The invariant is unchanged and non-negotiable: the provider key must
      never reach the browser (anything under `webapp/` lands in `Component-preload.js` and its
      sourcemaps). So the fix is to give the ABAP host the same server-side key-injecting
      component the other two hosts already have.
      Options considered, and why the other two lost:
      - **Cross-origin to the BTP approuter** — zero ABAP work, but its `/ai/*` routes are
        `authenticationType: xsuaa`, so an unauthenticated cross-origin `fetch` gets a 302 to the
        IdP that `fetch` cannot follow. Making it work needs CORS, `credentials: 'include'`,
        `SameSite=None` cookies *and* a pre-existing approuter session, then still breaks silently
        on session expiry — and it would make the ABAP/FLP deliverable depend on BTP uptime.
        Setting those routes to `authenticationType: none` to dodge the auth problem would put an
        open, key-bearing AI proxy on the public internet. Rejected.
      - **Key in the browser** — rejected outright, see the invariant.
      ✅ **Gating fact, answered 2026-07-27: `s40lp1` CAN reach the internet outbound.** An SM59
      type-G destination to `api.groq.com:443` with SSL active returned **HTTP 404 in 284 ms** —
      a 404 only comes from a real HTTP server, so TCP, TLS *and* certificate validation all
      succeeded. This was the single fact the whole approach hung on. Note the two false starts
      worth not repeating: testing `http://s40lp1:443` tests the box against itself over the wrong
      scheme, and leaving SM59's **Host** field empty while naming the *destination*
      `api.groq.com` connects to nothing — both produce "connection broken, 127 bytes sent".
      **Frontend — done, verified locally on 1.108.** `AiChatService.ts` no longer hardcodes a
      path. `resolveAiBasePath()` returns `/ai/` on BTP and local, `/sap/bc/zgp9_ai/` on ABAP, and
      providers now carry a relative `path` instead of a full `url`. Detection keys off
      `sap.ui.require.toUrl('com/zgp9/fe/')` containing `/sap/bc/ui5_ui5/` — the same mechanism
      3.5 uses, and for the same reason: embedded, `location`/`document.baseURI` describe the
      *launchpad*, not this app. One check covers both ABAP entry points because the target
      mapping points at that same BSP path (6.3).
      Verified on a running 1.108 page, not by reading: the six fetched URLs are byte-identical to
      the pre-refactor ones, and the predicate returns true only for the BSP root.
      **ABAP — written, not yet installed.** `ZCL_GP9_AI_PROXY` lives in the *backend* repo at
      `SAP09_BE/src/zcl_gp9_ai_proxy.clas.abap` — **a different git repo, needing its own commit
      and abapGit push.** It is a byte-transparent relay: `get_data`/`set_data`, no JSON parsing,
      so it never becomes a second place that has to know the providers' dialect.
      Setup runbook is in `README.md` → *ABAP setup*: table `ZGP9_AI_CFG`, two SM59 destinations,
      one SICF node `zgp9_ai`. Three things in it that are decisions, not detail:
      - Each SM59 destination pins the **full** path (`/openai/v1/chat/completions`), not just the
        host, so a destination cannot be steered at the providers' key-management endpoints —
        `GET /api/v1/key` returns the credit balance. Same rule as the approuter routes, enforced
        a layer lower.
      - The provider is chosen from a table row, never from the URL path. The path segment only
        selects a row.
      - ⚠️ **The key sits in plaintext in `ZGP9_AI_CFG`**, readable by anyone with `SE16` on it.
        Needs a table authorization group. This is genuinely weaker than the BTP path and it is
        the honest cost of this option — say so rather than bury it.
      **Known behaviour difference, accepted:** no progressive streaming on ABAP.
      `cl_http_client` buffers the whole response, so the answer appears at once rather than
      typing out. The SSE body is relayed unchanged, so the frontend needs no branch.
      ⚠️ **Trap that cost a deploy cycle — `sap.ui.require.toUrl()` is not necessarily
      absolute.** The first version of `isAbapHost()` tested `toUrl('com/zgp9/fe/')` directly for
      `/sap/bc/ui5_ui5/`. It returns whatever the resource root was *registered* as, and
      `index.html` registers `resourceroots` as `"./"` — so on the ABAP standalone URL it returns
      the relative `./`, with no path in it to match, and the ABAP branch was never taken. The
      local check that was supposed to confirm the predicate *printed* `toUrl: "./"` and it was
      read as incidental; the value that disproved it was in the output used to confirm it.
      Fixed by resolving first: `new URL(toUrl(…), document.baseURI).pathname`, which leaves an
      absolute root alone and resolves a relative one against the page.
      A second clause — `location.pathname.startsWith('/sap/bc/')` — is the backstop for the
      **embedded** case, where the FLP page is `/sap/bc/ui2/flp` and therefore the same ABAP host
      by definition. **The two clauses are not redundant; do not simplify to one.** Verified
      against all five host/URL combinations, including an FLP variant with a relative root.
      Note what caught this and what did not: `ts-typecheck`, `lint` and `ui5lint` were all green
      throughout, and both local dev *and* BTP legitimately resolve to `/ai/` — so only the
      **deployed ABAP host** could ever have exposed it. Same class as the 4.6 traps, one layer
      further out.
      🐞 **The FLP check ran on 2026-07-28 and failed — a seventh 1.108 trap, same class as the
      six in 4.6.** *Ask AI* inside FLP did nothing at all: no dialog, no request, no visible
      error. Console showed
      `ModuleError: failed to load 'sap/m/footer.js' … 404`, raised from `BaseController.ts:180`.
      **Cause:** `AiChatDialog.fragment.xml` put the input row in a `<footer>` aggregation on
      `sap.m.Dialog`. **1.108's `Dialog` has no `footer` aggregation** — it was added ~1.110.
      Confirmed three ways, not inferred: absent from the 1.108 typings (`Dialog` there has only
      `content`, `subHeader`, `customHeader`, `beginButton`, `endButton`, `buttons`), absent from
      the runtime metadata in `@openui5/sap.m@1.108.30/src/sap/m/Dialog.js`, and
      `Dialog.getMetadata().getAllAggregations().footer` → `undefined` in a live 1.108 browser.
      When the aggregation is missing, `XMLTemplateProcessor` falls back to treating the
      lowercase element as a **control name** in the default `xmlns="sap.m"`, so it requires
      `sap/m/footer.js` and 404s. That rejects `Fragment.load`, so the dialog is never created.
      **Fix:** the Toolbar moved to the end of `<content>`, with a `.aiChatFooter` class supplying
      the separator the real footer would have drawn. One fragment still serves both targets —
      same principle as the 4.6 icon swaps. **Do not move it back into a `footer` aggregation.**
      Second, smaller fix in `BaseController.onOpenAiChat`: the rejected `Fragment.load` promise
      was **cached and its rejection swallowed** (`void promise.then(...)` with no reject handler),
      so every later click was a silent no-op too — which is most of why this presented as "the
      button does nothing" rather than as an error. It now clears the cached promise and shows a
      MessageToast.
      **Verified on 1.108 (`npm start`), not by reading:** the fragment loads (`ok: true`), the
      input row renders full-width at the bottom below the message area with the 1px separator,
      `aiChatInput` still resolves for `focusAiChatInput()`, and **no `sap/m/footer` request is
      made at all**. `ts-typecheck`, `lint` and `ui5lint` all stayed at their documented baselines
      throughout — as with 4.6, **none of them reads a `.fragment.xml`**, so the console on a
      running 1.108 page was again the only check that could have caught this.
      ⚠️ **Why it reached production:** 3.7 was verified on the ABAP **standalone** URL, which
      loads **CDN 1.149** (1.6, deliberate), where `Dialog.footer` exists. The AI chat dialog was
      apparently never opened on a 1.108 page — 3.7's "verified locally on 1.108" covered the
      `resolveAiBasePath()` predicate, not the fragment. **Every host that runs 1.108 is FLP, and
      only FLP.** If you add UI in a fragment or view, open it on `npm start` before shipping.
      🐞 **Second FLP defect, found the moment the dialog opened: the answer was unreadable.**
      Near-white text on near-white bubbles inside FLP's dark shell — **measured contrast
      1.04–1.08:1** where WCAG AA wants 4.5. **The cause is much bigger than the AI chat and is
      recorded as deferred finding H: UI5 1.108 does not publish the `--sap*` CSS custom
      properties at all.** Every `var(--sapX, <light fallback>)` in `css/style.css` therefore
      takes its *light* fallback, on every theme, including FLP's dark one.
      Fixed for the AI chat by dropping `var(--sap*)` from those rules entirely: the bubbles now
      use translucent grey/blue/red tints layered over whatever the theme already painted, and
      **set no `color` at all** so the text colour is inherited from the theme. That tracks any
      theme on any UI5 version without naming one. Re-measured on a live 1.108 page:
      **dark 9.08–13.37:1, light 9.96–14.03:1, all AA pass**, with the three roles still visually
      distinct. **Do not reintroduce `var(--sap*)` into these rules.**
      **Still to do:** `npm run deploy`, then click *Ask AI* inside FLP to confirm end to end (the
      fixes above are verified locally but have **not** been on the ABAP system yet), and fix the
      OpenRouter model list — see the finding below.
      ⚠️ **Separate pre-existing bug found while testing this, NOT caused by the migration and
      NOT ABAP-specific: two of the three OpenRouter model ids are dead.** Proven live for
      `meta-llama/llama-3.3-70b-instruct:free` (OpenRouter answered *"This model is unavailable
      for free"*); `deepseek/deepseek-chat-v3-0324:free` is absent from the current model list but
      unconfirmed; `nvidia/nemotron-3-ultra-550b-a55b:free` is still listed. The slugs simply
      rotted. **This affects BTP identically** — it is invisible only because Groq is tried first
      and works, so the OpenRouter branch is reached exactly when Groq is rate-limited, i.e. the
      worst moment to discover it. Test candidates with the curl harness in
      `SAP09_BE/AI_PROXY_SETUP.md` and prune `PROVIDERS` in `AiChatService.ts` from evidence.
      ✅ **Replaced 2026-07-28** on the owner's instruction: the three rotted slugs are gone and
      OpenRouter now carries **`openai/gpt-oss-20b:free`** and **`inclusionai/ling-3.0-flash:free`**.
      Verified on a running 1.108 page that the dropdown builds correctly — Auto + 3 Groq + these 2
      — and that `getPreferredModel()` already discards a stored key that no longer exists, so
      anyone who had *DeepSeek V3* selected falls back to Auto with no migration needed.
      ✅ **Both new slugs confirmed working on the launchpad 2026-07-28**, selected explicitly in
      the dropdown so the OpenRouter path actually ran rather than being shadowed by Groq.
      *Ling 3.0 Flash* was observed end to end — a full structured answer over live
      `/IWBEP/COMMON` metadata, through the ABAP proxy. **The OpenRouter fallback is now covered by
      observation for the first time**; before today it had only ever been reached by accident,
      when Groq was rate-limited.
      ⚠️ **This coverage decays.** Free-tier slugs churn, and this path is invisible in normal use
      because Groq is tried first and succeeds. If the AI chat ever fails only under load, re-check
      these two before anything else — that is exactly how the previous three rotted unnoticed.

**Gate:** app builds and starts with no *new* console errors beyond the two environmental ones
(`$metadata`, `CSRF 502`) that appear whenever no ABAP backend is reachable. The deferred 3.7
failure does not count against this gate locally — it only surfaces on ABAP.

---

## Phase 4 — Local verification on 1.108

1.6 is done, so this is now live: `npm start` runs the app on 1.108.33. This is where control
drift across ~40 releases shows up, and it produced **six** real fixes (4.6) — the single
highest-yield phase of this migration.

- [x] 4.1 Confirmed the running UI5 really is 1.108: `/resources/sap-ui-version.json` reports
      library versions **1.108.30**, which is the OpenUI5 line inside the SAPUI5 1.108.33
      distribution (the two version series differ — do not expect 1.108.33 there).
      Note: `ui5-test-runner` prints its own unrelated "UI5 version used by the local server"
      line, which reported 1.150.0. Ignore it; the served framework is what matters.
- [x] 4.2 ✅ **COMPLETE 2026-07-28.** The two views this item was blocked on — JobList and
      JobDetail — are reachable now that `ScanJob.Execute` has been granted (Q6), and both were
      exercised inside FLP with real job data. All 13 views have now been opened. Original text
      follows.
      Click through all **11 reachable** views: Home ✅, RegistryList ✅, RegistryDetail ✅,
      VersionDetail ✅, ModelExplorer ✅, VersionCompare ✅, DetailCompare ✅, Logs ✅ —
      plus MainShell ✅ and App ✅, which are the shell and root and so are exercised by all of
      the above. **JobList and JobDetail are the two still unverified** — see the auth note below.
      `Main.view.xml` is **not** in this list: it has no route and no references, so it cannot be
      reached. See deferred finding F.
      **Done in two passes, and it is worth keeping them apart.** The first ran *unauthenticated*
      (see the correction in 4.6), reaching the detail views by typing route hashes with
      placeholder ids (`#/registries/1/versions/1/model` and so on). That proves only that each
      view instantiates and renders with no control, aggregation or icon errors — which is exactly
      the class of bug 1.108 produces, since 4.6 traps 2 and 3 were both instantiation failures,
      but says nothing about data-driven rendering, formatters or empty-vs-populated states.
      The second pass ran *signed in against real data* and is what closed those gaps — and what
      surfaced 4.6 items 5 and 6, neither of which appears on an empty page.
      Notable: DetailCompare renders **two `sap.m.Tree`s** plus a Splitter, confirming at runtime
      that the 1.4 `TreeTable` → `Tree` correction was right about which control is actually there.
      **JobList/JobDetail are still unverified, and a session was not enough.**
      `MainShell.controller.ts:82` redirects any `job*` route home unless `/canExecuteScanJob`,
      which `loadGlobalPermissions()` reads from the backend. Signed in as **DEV-173** the side
      navigation shows only Home / Registry Management / Logs — **no Jobs entry** — so that user
      does not hold `ScanJob.Execute` and the two job views cannot be reached at all, authenticated
      or not. Not a bug; a missing role. To close 4.2 and 4.3 someone needs an account that has
      `ScanJob.Execute` (try DEV-257, or grant it), otherwise both views and the FCL two-column
      transition reach the launchpad unexercised — the same first-run risk Phase 3 already carries.
      **Verified with real data 2026-07-26** (signed in, 4 registries): Home end to end including
      Scan Activity, Attention Required and Recently Changed Registries; the registry, version,
      model-explorer and comparison chain; Logs. Two `[FUTURE FATAL]` findings came out of that
      pass — 4.6 items 5 and 6.
- [~] 4.3 Exercise `sap.f` FlexibleColumnLayout column transitions and `DynamicPage`
      collapse — these existed in 1.108 with fewer properties than 1.149.
      FCL itself instantiates and renders on 1.108 (`.sapFFCL` present, `layout: OneColumn`), and
      `DynamicPage` renders and behaves on RegistryList, Logs, ModelExplorer and DetailCompare
      with real rows loaded. Note all of them set `toggleHeaderOnTitleClick="false"` and
      `pinnable="false"`, so the header collapses on **scroll only** — there is nothing to click
      and no pin button, and their absence is by design rather than a 1.108 regression.
      ⛔ **The one thing still open in this item: the FCL column transition.** `jobDetail` is the
      *only* target using `midColumnPages` — every other target is `beginColumnPages` — so the
      two-column path is reachable solely through the job routes, which need `ScanJob.Execute`
      (see 4.2). Nothing in the app exercises two columns until someone with that role opens a
      job. Until then this stays `[~]`.
- [x] 4.4 Exercise the `sap.ui.layout.Splitter` split views and the responsive breakpoints
      driven by `Component.ts:57-75` (`isPhoneWidth` / `isNarrowWidth`). **Verified on 1.108**,
      empty first and then again with real content in ModelExplorer and DetailCompare.
      On ModelExplorer, crossing 1024px flips the Splitter from `sapUiLoSplitterH` to
      `sapUiLoSplitterV` and its height from `42rem` to `64rem`, exactly as the expression
      binding declares; below 600px `isPhoneWidth` flips and `MainShell.onInit` loads with the
      side nav collapsed (`sideExpanded: false`). Splitter panes and the drag separator render.
      Not covered, and deliberately not chased: **dragging** a separator to resize a pane. The
      orientation flip is the version-sensitive part; drag handling is core Splitter behaviour
      that 1.108 shipped long before.
      ⚠️ **Testing trap, cost half an hour — do not re-diagnose it as an app bug.** Resizing the
      viewport through browser *automation* (CDP `setDeviceMetricsOverride`) changes
      `window.innerWidth` and `matchMedia().matches` but fires **neither** a `resize` event nor a
      MediaQueryList `change` event. So `ui>/isPhoneWidth` sits stale and disagrees with
      `matchMedia` — it looks precisely like a broken listener. `window.dispatchEvent(new
      Event('resize'))` updates it correctly, which is what proves the app logic is fine. A real
      browser window drag fires the events normally.
- [x] 4.5 `npm run test-unit` at **78/82** — the baseline, with the same 4 pre-existing
      `Home – bucketScanTrend` failures and nothing new. **Not our scope beyond this:** the
      QUnit suite is owned by another team member. The bar for this migration is "no worse than
      78/82", not "green". Runs on 1.149 by design (2.7).
- [~] 4.6 Differences found so far. **Six defects, all fixed** — every one found locally, each of
      which would otherwise have cost an ABAP deploy cycle to discover. This is the entire payoff
      of step 1.6.
      Items 1–3 are hard 1.108 runtime incompatibilities: the app did not render at all. Items 4–6
      are quieter and were only caught by reading the console on a running 1.108 page — a blank
      icon, and two `[FUTURE FATAL]` assertions. Worth noting how they divide: **1–3 fail loudly
      and would have been found by anyone opening the app; 4–6 fail silently and pass every static
      check.** If more views are added later, the console sweep is the step that catches their
      equivalents.

      1. **Kebab-case bootstrap attributes are silently ignored → blank page.**
         `data-sap-ui-resource-roots`, `data-sap-ui-on-init`, `data-sap-ui-compat-version`,
         `data-sap-ui-frame-options` are the newer configuration-API forms. 1.108 parses them
         to unknown keys, so no resource root is registered and `ComponentSupport` never runs.
         The symptom is brutal: an **empty body with a clean console** — Core initialises, no
         Component is ever created, and nothing errors. Nothing tells you the attributes were
         dropped.
         Fixed in `index-local.html` and `webapp/test/preview.html` by using the legacy
         single-token names (`resourceroots`, `oninit`, `compatversion`, `frameoptions`), which
         both 1.108 and current UI5 understand.
         ⚠️ **`index.html` and `index-cdn.html` still use kebab-case** and were left untouched
         on purpose (they serve BTP and the ABAP standalone URL on CDN 1.149, where kebab-case
         works). This is now a **hard prerequisite** for the idea floated in 1.6 of repointing
         `index.html` at `/sap/public/bc/ui5_ui5/resources/sap-ui-core.js`: doing that without
         first converting its attributes yields a silent blank page.

      2. **`sap.ui.model.odata.v4.ODataModel` requires `synchronizationMode` on 1.108.**
         `Error: Synchronization mode must be 'None'` from `ODataModel.js:260`, thrown during
         `Component._createManifestModels` — the app died before rendering anything.
         The parameter was mandatory in 1.108 and only deprecated later.
         Fixed by adding `"synchronizationMode": "None"` to the model settings in
         `manifest.json`. Passing `"None"` is valid on newer versions too, so BTP is unaffected.

      3. **`sap.tnt.ToolPage`'s `header` aggregation only accepts `sap.tnt.IToolHeader`.**
         `MainShell.view.xml` put an `sap.m.OverflowToolbar` there, which logs
         `"is not valid for aggregation 'header'"` on 1.108. Newer UI5 relaxed the aggregation,
         which is why it passed on 1.149.
         Fixed by swapping to `sap.tnt.ToolHeader`, which *extends* `OverflowToolbar` and
         implements `IToolHeader` — so every child control behaves identically.

      4. **Two `sap-icon://` names do not exist in the 1.108 icon font.** Found 2026-07-26 during
         4.2, from the warning `Icon info for icon 'box' in collection 'undefined' could not be
         found`. `box` and `lines` were both added to the Fiori icon font after 1.108; on the
         launchpad they render as **nothing at all** — no glyph, no error, no fallback.
         Fixed: `sap-icon://box` → `sap-icon://inventory` (`Home.view.xml:78`, the Archived KPI
         tile) and `sap-icon://lines` → `sap-icon://text-align-justified`
         (`DetailCompare.view.xml:155`, the "All lines" diff toggle). Both replacements are old
         icons present in 1.149 too, so BTP is unaffected.
         **The check is cheap and worth repeating after any view edit** — paste the app's icon
         names into `IconPool.getIconInfo()` in the console on a 1.108 page and list the misses.
         All 43 currently used names were swept this way; these two were the only failures.
         The severity is easy to underrate: unlike traps 1–3 this one does not break the app, so
         it survives every static check and reaches the launchpad as a silently blank tile icon.

      5. **`sap.ui.core.Item` has no `width` property.**
         `Assertion failed: [FUTURE FATAL] Element …---versionDetail: encountered unknown setting
         'width' for class sap.ui.core.Item (value:'100%')`, from `VersionDetail.view.xml:59`.
         The setting was silently swallowed rather than applied — and the enclosing `Select` on
         line 55 already carries `width="100%"`, so the attribute was doing nothing on any
         version. Fixed by deleting it. `[FUTURE FATAL]` means a later UI5 turns this assertion
         into a thrown error, so it is worth clearing even though 1.108 tolerates it.

      6. **A nested aggregation binding with no `templateShareable` flag.**
         `[FUTURE FATAL] During a clone operation, a template was found that neither was marked
         with 'templateShareable:true' nor 'templateShareable:false' … used in aggregation 'items'
         of object '__list2'`. The culprit is `Home.view.xml:170`, a `List` bound to
         `home>changeSummary/details` that sits **inside** the `VBox` template on line 148 — so it
         is cloned once per recently-changed registry, and UI5 cannot tell whether to destroy its
         template. It was the only nested aggregation binding in the file, which is what
         identified it. Fixed with `templateShareable: false`, matching lines 100, 148 and 186,
         which already declare it. Consequence of leaving it: leaked templates and possible
         duplicate ids as the Home list re-binds on every refresh.

      **Expected dev-only console noise, not a finding:** `Component-preload.js` 404 plus
      `Refused to execute script … MIME type ('text/html')`. `ui5 serve` does not build a
      component preload, so UI5 probes for it, gets the server's HTML fallback, and drops back to
      loading modules individually. It does not occur on ABAP or BTP, where the build emits a real
      preload.

      Still outstanding: 4.2 (JobList/JobDetail) and 4.3, both blocked on the missing
      `ScanJob.Execute` role rather than on the session.
      The Home view renders correctly end to end (shell, side nav, dashboard tiles, Scan
      Activity, Quick Actions).
      ⚠️ **Correction (2026-07-26): the claim that "no ABAP backend is reachable from this
      machine" is wrong, and it was hiding the real state.** `s40lp1` *is* reachable — the
      proxy's `$metadata` call returns **HTTP 401** with
      `www-authenticate: Basic realm="SAP NetWeaver Application Server [S40/324]"`, i.e. a real
      answer from a real server, not a connection failure. Every earlier reading of these two
      console errors as "environmental, no network" was wrong; they are an **unauthenticated
      session**. Consequence: local dev with data needs the ABAP user (DEV-173 / DEV-257) entered
      into the browser's Basic Auth prompt, which `ui5-middleware-sap-proxy` deliberately enables
      by forwarding the 401 and its `WWW-Authenticate` header verbatim
      (`lib/sap-proxy.js:215-225`). Until that is done the app runs but every list is empty and
      every permission is `false`.
      Side effect worth knowing: the 401 makes `ErrorHandler` fire, which logs
      `Route with name login does not exist` and puts a "Your session expired" dialog on screen.
      That is deferred finding **G**, not a migration regression.

**Gate:** all 13 views usable on 1.108 locally. Do not deploy before this passes — a
server round trip per bug is far slower than finding them here.
**Status: passed with two named exceptions** (2026-07-26). Every view except **JobList** and
**JobDetail** is usable on 1.108 with real data. Those two are **not** waived — they are
unreachable because DEV-173 lacks `ScanJob.Execute`, so they carry into Phase 7 as unexercised
code alongside the Phase 3 embedding branches. Record the outcome here once someone with that
role opens them, on 1.108 either locally or in FLP.

---

## Phase 5 — ABAP deploy

**The app was already deployed once, into `$TMP`.** `TADIR` (`R3TR` / `WAPA` /
`ZGSU26GP09_FE_1`) showed `DEVCLASS = $TMP`, author `ZGP9_LEAD2` — so a teammate deployed it
before this migration. That matters more than it looks: **in ABAP the package is a property of
the existing object, not of the deploy config**, so editing `ui5-deploy.yaml` alone does not move
it. The object has to be reassigned in SE03 as well (5.1b), or the deploy keeps it local or fails
on the mismatch.

- [x] 5.1 Transportable package and transport request. **Done 2026-07-27**, including the
      reassignment out of `$TMP`.
      - **Package `ZGSU26GP09` — already existed**, created by DEV-257 on 04.06.2026 for the
        team's ABAP work ("Document and Metadata file manangement"). Reused rather than creating a
        frontend-specific one, so the whole project travels in one transport. It is transportable:
        **Record Object Changes in Transport Requests** is ticked, software component `HOME`.
        Its transport layer is **`SAP`**, which is technically the layer for SAP standard objects
        rather than a customer layer — unusual but harmless here, and *not* worth "fixing" on a
        shared training system.
      - **Request `S40K919517`** (workbench, modifiable), task `S40K919518`. Target is **`DMY`**,
        a virtual consolidation system — there is no QA system to import into, which is expected
        on this box. The request exists to get the object out of `$TMP`, not to move it anywhere.
      - **5.1b — reassignment, done.** `SE03` → Object Directory → Change Object Directory
        Entries → tick a free row, `WAPA` / `ZGSU26GP09_FE_1` → Object Directory Entry → package
        `$TMP` → `ZGSU26GP09`, recorded in `S40K919517`. Verified in the result tree: the object
        now hangs under `ZGSU26GP09`.
        Two snags worth writing down, since this screen is used rarely and both cost a round trip:
        the **Package** field under *Further Restrictions* filters on the package an object is
        **already in**, so entering the *target* package finds nothing — leave it empty or use
        `$TMP`; and on the free object rows the PGMID column is display-only, so the object type
        (`WAPA`) goes in the **second** field and the row implicitly means `R3TR`.
        The object's author is `ZGP9_LEAD2`, not the user who moved it, and no authorization or
        lock error appeared. Worth telling that teammate anyway: the app is transport-managed from
        now on, and a stale local `ui5-deploy.yaml` still pointing at `$TMP` will fight this.
- [x] 5.2 `ui5-deploy.yaml` — `package: "ZGSU26GP09"`, `transport: "S40K919517"`. Note it takes
      the **request**, not the task. Do not release the request before 5.3 runs.
- [x] 5.3 `npm run deploy` — **succeeded 2026-07-27 as DEV-173.** Credentials are the on-prem
      ABAP user, **not** a BTP login. **Run it from a real terminal:** it prompts for the password
      on stdin, so it cannot be driven from a non-interactive shell.
      Confirmed in the log: `ABAP Package: ZGSU26GP09`, `Transportauftrag "S40K919517"`,
      `found on target system: true` — so it updated the existing repository in delta + safe mode
      rather than creating a new one, and the 5.1b reassignment held. 165 files.
      Note the two `No credential found` warnings and the first `401` are **normal**: the tooling
      probes its credential store, finds nothing, and only then prompts. Not an auth failure.
      ⚠️ **The upload shipped `com.zgp9.fe.zip` — the app packaged inside itself.** `npm run
      deploy` runs `npm run build`, which uses `ui5.yaml`, whose `ui5-task-zipper` writes that
      archive into `dist/` for the **BTP** html5-apps-repo path; `fiori deploy` then uploads
      everything in `dist/`. Dead weight in the BSP repository, and a second stale copy of the app
      to confuse anyone browsing it. Fixed by adding `"\\.zip$"` to `ui5-deploy.yaml` `exclude`,
      which takes effect on the next deploy. Related to deferred finding **B**.
- [x] 5.4 Verify the standalone URL: `/sap/bc/ui5_ui5/sap/zgsu26gp09_fe_1/index.html`.
      **Passed 2026-07-27** as DEV-173: shell, side navigation, Registry Management, Version
      Details and the XML viewer all render from the ABAP repository.
      **One expected failure, not a regression:** this URL boots **CDN 1.149**, not 1.108, because
      `index.html` was deliberately left on the CDN bootstrap (1.6). So 5.4 proves the deploy,
      *not* the migration. 1.108 is what FLP loads, and that is Phase 7.
      ⚠️ **The AI-chat failure recorded here is FIXED as of 2026-07-28 — this paragraph is
      history, not current state.** As observed at the time: `AI request failed (404)` on
      VersionDetail, one click producing **six** failed POSTs (three to `/ai/groq/chat/completions`
      then three to `/ai/openrouter/chat/completions`) because the model fallback chain retries
      each. That measurement is what made the six-round-trips-per-click cost concrete. It now
      makes a single successful POST to `/sap/bc/zgp9_ai/groq/chat/completions` — see 3.7.
- [~] 5.5 `/UI2/APP_INDEX_CALCULATE` and `/UI2/INVALIDATE_GLOBAL_CACHES`. **Deliberately deferred
      to the first symptom, 2026-07-27 — not skipped through oversight.** Reasoning, so it is not
      re-litigated:
      - The 5.3 upload already reported `* Anwendungsindex wird aktualisiert *`, so this app is
        indexed. Nothing in Phases 6–7 is waiting on a re-run.
      - `INVALIDATE_GLOBAL_CACHES` exists to flush *stale* FLP data, and FLP has never served this
        app — there is no target mapping yet, so nothing stale exists to clear. It is also
        genuinely system-wide: it clears the shared UI2 caches for every user in client 324.
        Nothing is lost and no configuration changes, but everyone's next FLP load rebuilds its
        cache. On a shared university system that is worth having a reason for.
      - ⚠️ **`/UI2/APP_INDEX_CALCULATE` does not exist as a program on `s40lp1`** — SE38 reports
        it missing. The name comes from SAP's standard documentation but SAP_UI releases differ.
        If it is ever needed, find the real one with `/UI2/APP*` + F4 in SE38, or SE84 →
        Programs. Do not assume the documented name.
      **Run them when, and only when, one of these appears:** a manifest change with no visible
      effect, a tile that will not resolve despite a correct target mapping, or FLP serving an old
      descriptor. That is also the moment Q2 becomes testable.

**Gate:** app loads from the ABAP standalone URL. ✅ **Passed 2026-07-27** — see 5.4. Phase 5 is
complete apart from 5.5, which is deferred by decision rather than outstanding.

---

## Phase 6 — Launchpad configuration

Transaction and field names vary slightly by release; adjust to what the system shows.

**The name is decided (Q5) and already in the code — do not invent a new one here.** Semantic
object **`ZODataServiceRegistry`**, action **`manage`**, intent
**`ZODataServiceRegistry-manage`**. It is written in three places that must agree exactly, of
which two are already done: `manifest.json` `sap.app.crossNavigation.inbounds` ✅ (3.2),
`webapp/test/flpSandbox.html` ✅ (3.0, though that page does not boot), and `/n/UI2/SEMOBJ` —
6.1 below, still to do.

- [x] 6.1 Semantic object — `/n/UI2/SEMOBJ`. **Created 2026-07-27** as
      **`ZODataServiceRegistry`** / name `ZODataServiceRegistry` / description
      `OData Service Registry`. It is case-sensitive and matches `crossNavigation.inbounds` (3.2)
      character for character — the field does **not** force uppercase, which is what makes the
      mixed-case name viable.
- [x] 6.2 Catalog — **`/UI2/FLPD_CUST`**, the classic Launchpad Designer, which this release still
      has. **Created 2026-07-27:** title `OData Service Registry`, ID **`ZGSU26GP09_FE_CAT`**,
      type **Standard** (not Remote, which is deprecated and for cross-system tile sources).
      Full internal ID: `X-SAP-UI2-CATALOGPAGE:ZGSU26GP09_FE_CAT`.
      Two things seen here, neither a problem:
      - **No transport prompt.** Designer content in `scope=CUST` is client-specific *customizing*,
        not a workbench object like the BSP app, and this client does not auto-record customizing
        changes. So the FLP configuration lives only in client 324 and is **not** in
        `S40K919517`. Irrelevant while the transport target is `DMY`, but worth knowing before
        anyone asks why the tile is missing from the transport.
      - **An error dialog on open:** *"Object Component Configuration 0C67C…EFC does not exist"*
        for `SAP_TC_SCM_MPE_COMMON`, an **SAP-delivered** catalog that happened to be selected.
        Pre-existing damage on this shared system, flagged with a red triangle in the catalog
        list. Not ours; do not chase it.
      - SAP's banner says the designer is superseded by the App Manager / Content Manager
        (note 3170196). It still does catalogs, target mappings and tiles correctly — the
        successor tools matter at 6.5, where spaces and pages live.
- [x] 6.3 Target mapping — **created 2026-07-27**, verified in the list as
      `ZODataServiceRegistry` / `manage` / SAPUI5 Fiori App / Desktop ✓ Tablet ✓ Phone ✓:
      - Semantic object **`ZODataServiceRegistry`**, action **`manage`**
      - Application Type: **SAPUI5 Fiori App**
      - URL: `/sap/bc/ui5_ui5/sap/zgsu26gp09_fe_1` (no `index.html` — embedding loads the
        Component, not the page)
      - Component ID: `com.zgp9.fe`
      - Device types: desktop, tablet, phone (manifest declares all three)
- [x] 6.4 Static app-launcher tile — **created 2026-07-27.** Title `Registry Control Center`
      (the resolved `appTitle` from `webapp/i18n/i18n.properties`, so tile and app header agree),
      subtitle from `appDescription`, icon `sap-icon://business-objects-experience`.
      Navigation is by **intent** — "Use semantic object navigation" ticked,
      `ZODataServiceRegistry` / `manage` — **not** a raw URL.
      ⚠️ **Why that distinction is the whole point:** a URL tile launches the app standalone in a
      bare tab, bypassing the target mapping. It looks like success — the app loads and works —
      while every `isInLaunchpad()` branch stays false and nothing this migration built is
      actually exercised. If 7.1/7.2 ever show the app with no FLP shell bar, check the tile's
      navigation type before suspecting the code.
- [~] 6.5 **Route (a) done 2026-07-27, route (b) still open.** The app was added to **My Home** via
      *Edit Page → App Finder*, where it appeared under the catalog title "OData Service Registry"
      — which is itself proof that 6.2/6.3/6.6 are wired correctly, since the App Finder reads the
      catalog through the role. The tile then launched the app in the shell (6.7).
      **Still to do for the deliverable: a dedicated space and page** — route (b) below.
      **Page + space, not a group** — Q4 came back "spaces and pages" (2026-07-27).
      **Two routes, and the cheap one is worth doing first as a smoke test:**
      - **(a) `My Home`.** It is enabled on this system. Once the catalog reaches your user via
        6.6, open FLP → *My Home* → **Edit Page** → App Finder → find the app → add it. No space,
        no page, no extra admin. This proves the target mapping and the app launch in minutes, and
        isolates any failure to 6.1–6.4 rather than to page assignment.
      - **(b) A dedicated space and page** — the complete answer, and the one to write up.
        `/UI2/FLPCM_CUST` (FLP Content Manager, client-specific) creates the space and page and
        assigns the catalog; `/UI2/FLPAM` is the App Manager alternative. Create the **page**
        first, put the tile on it, then create the **space** and assign the page to it.
      Do (a) to prove it works, then (b) for the deliverable.
- [x] 6.6 PFCG role — **created 2026-07-27 as `ZGSU26GP09_FE_ROLE`** ("OData Service Registry -
      FLP access"), carrying the catalog. **No admin help was needed**; DEV-173 could create roles.
      Assigned to **DEV-173, DEV-174, DEV-257**, valid to 31.12.9999, all four tabs green.
      The steps, since PFCG's wording differs from most guides:
      - Menu tab → the **`Transaction` button's ▾ dropdown** (there is no menu item called "Insert
        Node") → **SAP Fiori Launchpad → Launchpad Catalog** → Catalog ID `ZGSU26GP09_FE_CAT`,
        provider "Fiori Launchpad Catalogs", **Local** Front-End Server (s40lp1 is both frontend
        and backend here), **Include Applications** ticked — which is what adds the *Applications*
        tab and feeds the authorization defaults.
      - Authorizations → Change Authorization Data → accept the auto-generated profile name
        (`T-*`, capped at 12 chars and collision-free — do not hand-write one) → **Generate**.
      - User tab → enter the user IDs, **press Enter to resolve the names** (a blank User Name
        means the ID does not exist) → **User Comparison → Full Comparison**.
      ⚠️ **User Comparison is the step that is silently fatal to skip.** Without it the assignment
      sits in the role but never reaches the user buffer, and the app is simply absent from the App
      Finder with no error anywhere to explain it.
      The same dropdown offers **Launchpad Space**, which is what 6.5 route (b) will add here once
      the space exists — a third confirmation of Q4.
      Still to ask an admin: **`ScanJob.Execute`** (Q6), needed to close 4.2 and 4.3. That one was
      *not* covered by this role.
- [x] 6.7 Open FLP at `/sap/bc/ui2/flp` and launch the tile. ✅ **Done 2026-07-27 — worked first
      attempt.** The tile launched the app inside the launchpad shell, on 1.108.33, with live data.
      No cache invalidation was required (5.5) and `_version: "2.0.0"` caused no problem (Q2).
      Practical note: **hard-refresh FLP (Ctrl+Shift+R) after changing the role.** A tab loaded
      before the role existed serves cached user content and the app appears to be missing.

**Gate:** tile appears in FLP and opens the app inside the launchpad shell. ✅ **PASSED
2026-07-27.** The tile launched the app inside the shell on the first attempt, with the FLP shell
bar present, the app's own header correctly absent, and live data. No cache invalidation was
needed to make the tile resolve (see 5.5), and Q2's `_version: "2.0.0"` warning proved harmless —
FLP resolved the component without complaint.

---

## Phase 7 — Regression and close-out

> ✅ **The first-run risk this phase carried is now spent.** Earlier revisions warned that 7.1–7.3
> bore the entire verification burden for Phase 3, because the local sandbox never booted (3.0) and
> every `isInLaunchpad()`-true branch would reach the launchpad unexercised. **That happened on
> 2026-07-27 and four of the five branches were correct first time** — see the Phase 3 status
> block. No deploy round trip was needed. What remains here really is a regression pass, with two
> exceptions: **7.3**, which needs rewriting rather than running (the 3.4 finding), and **7.6**,
> which is the last genuinely unproven claim in the whole plan.

- [x] 7.1 ✅ **COMPLETE 2026-07-28.** Every view has now been opened inside the launchpad, on
      1.108, against real data. The sweep earned its place: it is what found findings **H**, **I**
      and **J**, none of which any static check or local run could have surfaced. Notably
      **DetailCompare was the last view ever reached**, because the bug that hid its entry point
      (finding I) was itself only visible at launchpad width. Original text follows.
      All 13 views again, this time **inside** FLP — 3.5 and 3.6 bugs only appear here.
      **Partially done 2026-07-27.** Verified inside the launchpad: **Home** end to end (KPI tiles,
      Scan Activity, Attention Required, Quick Actions) and **Registry Explorer** including the
      status filter and a reloaded deep link. Both 3.5 and 3.6 — the two bugs this item exists to
      catch — are confirmed, and no app-side console error appeared on either view.
      **Still to click through inside FLP:** RegistryDetail, VersionDetail, ModelExplorer,
      VersionCompare, DetailCompare, Logs. Lower risk than it looks — they all render correctly on
      1.108 standalone (4.2) and the two FLP-specific mechanisms are already proven — but the
      DynamicPage/Splitter views are worth a look inside the shell, where the available height
      differs.
      ✅ **JobList unblocked 2026-07-28** — *Scan Job Management* renders inside FLP with real job
      rows (mixed AUTO/MANUALLY, `DEV-257` / `ZGP9_LEAD2`), so `ScanJob.Execute` has been granted
      (Q6). **JobDetail and the FCL two-column transition are still unclicked** — that is one row
      click away and is the app's only two-column transition, so it is worth doing deliberately.
      ⚠️ **Three of these views carry the *Ask AI* button** — ModelExplorer, VersionDetail and
      DetailCompare. Do not treat them as "rendered fine, done": the 3.7 defect was invisible
      until that button was pressed, and it lives in a fragment that only loads on press.
      Specifically:
      - **3.5** — is the app *styled*? A stylesheet 404 renders it unstyled rather than broken,
        which is easy to walk past. Confirm `css/style.css` is 200 in the network tab, not just
        that the page "looks fine".
      - **3.6** — open a deep link with a status filter and confirm the filter actually applies.
        The FLP hash is `#ZODataServiceRegistry-manage&/registries?status=A`.
        ⚠️ **Two traps in testing this, both hit on 2026-07-27.** First, the **status dropdown on
        RegistryList does not write the hash** — it filters in place. Only the Home KPI tiles
        produce the query parameter, via `Home.controller.ts:182`
        `navTo('registryList', { query: { status } })`. So the deep link has to be reached by
        clicking a Home tile, not by using the filter control.
        Second, the values are the **single letters** `P` / `U` / `A` from `CustomData` in
        `Home.view.xml`, not words — an earlier revision of this file said `?status=Published`,
        which does not exist.
        Test it with **Archived** or **Unpublished**, not Published: on this dataset all four
        registries are Published, so a Published filter is indistinguishable from no filter and
        looks broken when it is working.
      - ~~Flip 3.1–3.6 from `[~]` to `[x]` only once this passes.~~ Done for 3.1, 3.2, 3.5 and 3.6.
        3.3 stays `[~]` pending 7.2's phone check; 3.4 is `[!]` — a finding, not a pass.
- [x] 7.2 ✅ **CLOSED 2026-07-28.** Desktop confirmed 2026-07-27 (shell bar with the app title,
      app header entirely absent, side navigation working). **Phone width confirmed 2026-07-28 at
      400px inside FLP:** the app header reappears carrying **only the menu button**, the side nav
      is collapsed, and the KPI tiles stack — exactly the deliberate departure recorded in 3.3.
      That decision is now verified rather than merely argued: without the header an embedded phone
      user would have had no way to reopen the navigation.
      Original wording follows.
      Check **both widths**: on desktop the app header should be gone entirely; below 600px it
      should reappear carrying only the menu button, which is the sole way to reopen the side
      nav. Also confirm the desktop side nav is still usable while no longer collapsible — that
      trade-off was accepted deliberately, see 3.3.
- [x] 7.3 ✅ **CLOSED as not applicable, 2026-07-27.** 3.4 was decided by deletion, so there is no
      app-side logout to test inside FLP: logout is the shell's responsibility, exercised through
      the launchpad's avatar menu. Nothing to run. The original reasoning follows.
      ⚠️ **Cannot be tested as written — needs rewriting, not running. See the 3.4 finding.**
      The item assumed the app performs the logout when embedded. It does not and cannot: the
      Logout button is hidden when embedded (3.3), and it is the only path to
      `logoutFromLaunchpad()`. So `sap.ushell.Container.logout()` is unreachable and this test has
      no trigger to pull.
      **What to do instead, once 3.4 is decided:**
      - If 3.4 is **deleted**: close this item as not applicable. Logout is the shell's
        responsibility, exercised by the FLP avatar menu, and the app has no part in it.
      - If 3.4 is **kept** as a seam: rewrite this to test whatever ends up calling
        `redirectToLogout()` — most plausibly session-expiry handling, which today does something
        else entirely (deferred finding **G**).
      Either way, do **not** go looking for a bug inside `Launchpad.ts`. The original note here —
      that 1.108's typings generate `logout: undefined`, which is why `Launchpad.ts` declares its
      own minimal interface — is still accurate and still the reason that file looks the way it
      does. It just has no caller.
- [ ] 7.4 Back/forward browser navigation across app routes under the FLP hash
- [~] 7.5 FLP theme switch does not fight the app.
      ✅ **The finding-H half is closed, 2026-07-28.** The app renders legibly under the shell's own
      dark theme on every page sampled — Home, VersionDetail, VersionCompare — at 6.24–15.37:1
      across 8 elements. `.xmlTokTag` = 6.24 specifically proves the `html[class*="_dark"]`
      selector matches the launchpad's theme, which is what could not be tested locally
      (`ui5.yaml` declares only `themelib_sap_horizon`, so Quartz 404s in dev).
      **Still open here is the original item**: whether a *stored* app theme preference overrides
      the shell's. See the `applyStoredTheme()` test below — that is now the only part left.
      **Partial pass 2026-07-27:** the app rendered in FLP's **dark** theme without fighting it
      (`quartz.css` / `text_styles_quartz.css` served by the shell), so the shell's theme reaches
      the app and the app does not override it on load.
      ⚠️ **The mechanism to probe is `Component.applyStoredTheme()`.** It runs on every init and
      calls `Core.applyTheme(storedTheme)` when a preference exists in session storage — which
      would override the launchpad's theme. The app's own theme toggle is hidden when embedded
      (3.3), so a preference can only have been set while running standalone, and then carried
      into FLP. Not observed (FLP and app are both dark here), which may only mean they happen to
      agree.
      **Test:** run the app standalone, toggle it to **light**, then open it from the FLP tile
      while FLP is **dark**. If the app comes up light inside a dark shell, that is a real defect
      and the fix is to skip `applyStoredTheme()` when `isInLaunchpad()`.
- [x] 7.6 ⛔ **DROPPED from the plan, 2026-07-28 — BTP is not going to be used.** Owner's call.
      This item was previously flagged here as "the real risk left", so the removal is deliberate
      rather than an oversight: nothing verifies the BTP deployment any more, and the claim that
      `minUI5Version` is a floor rather than a pin is now **permanently unproven end to end**. That
      costs nothing while FLP is the only target, and the source is constrained to the 1.108 API
      surface regardless, because the launchpad requires it.
      **Nothing was deleted.** `mta.yaml`, `xs-app.json`, `xs-security.json`, the `approuter/`
      module and the `/ai/` base-path branch all remain in the tree and still build. The `/ai/`
      branch in `resolveAiBasePath()` must stay in any case — **local `npm start` uses it too**, so
      it is not BTP-only code.
      Consequence for the deferred findings: **C** (`zgp9-ias` dead weight), **D** (hardcoded trial
      URL in `xs-security.json`) and **E** (unscripted BTP deploy) are now moot unless BTP comes
      back. **A** (the two drifted `xs-app.json` files) is only half moot — the root copy is still
      bundled into the app zip by `ui5-task-zipper`.
- [ ] 7.7 Update `README.md`:
      - Add the ABAP/FLP deploy path — currently undocumented
      - Fix line 57, which claims `index.html` loads UI5 from a relative `resources/...`
        path. It hardcodes the CDN.
      - Fix lines 116-121, which claim the AI routes check `$XSAPPNAME.AiUser` via a `scope`
        property in `xs-app.json`. After `123d5ab` no such scope or property exists.

---

## Deferred findings — out of scope here, but real

**A–F** were found while surveying the deploy setup before this migration started; **G** surfaced
during Phase 4 verification but is equally pre-existing (it reproduces on 1.149). **None is caused
by the migration** and none blocks it, but they are real and would otherwise be lost. Three
intersect work in this plan, as noted.

- **A. Two `xs-app.json` files that have drifted.** ⚠️ *intersects Phase 3.4.*
  `approuter/xs-app.json` is the live approuter config: `logoutPage: "/logout.html"`, and a
  catch-all rewriting to `/comzgp9fe/$1` via `html5-apps-repo-rt`. The **root** `xs-app.json` is
  a different file, zipped into the app bundle by `ui5-task-zipper` (`ui5.yaml`), and still
  carries `logoutPage: "/"` plus a duplicate copy of both `/ai/*` destination routes.
  The logout-loop fixes (`b918682`, `e9e086d`) only updated the approuter copy. Corroborating
  evidence that the root file is the stale one: `ui5-middleware-sap-proxy/lib/sap-proxy.js:157`
  redirects `/logout` → `/logout.html`, matching the approuter, and the comment at
  `webapp/controller/MainShell.controller.ts:126-131` still describes the old `"/"` behaviour.
  Decide which file is authoritative and stop hand-maintaining the other. Do this **with** 3.4,
  since that item rewrites the logout path anyway.

- **B. Build artifacts are committed to git.** ⚠️ *will keep biting at Phase 7.6.*
  `resources/com.zgp9.fe.zip` is tracked and regenerated by every `mbt build`, so it dirties the
  tree on every BTP build — commit `6493b72` re-committed it. `archive.zip` (~1.5 MB at the repo
  root) is tracked, contains a stale `dist` snapshot plus a nested copy of the app zip, and is
  referenced by **nothing** in `mta.yaml` or `ui5.yaml`. `.gitignore` covers `dist/`,
  `mta_archives/` and `*.mtar` but not these two.

- **C. `zgp9-ias` may be dead weight — and a logout-loop suspect.**
  `mta.yaml:99` provisions an identity service and the approuter requires it, but every route in
  both `xs-app.json` files is `authenticationType: xsuaa`, and the working login is the trial
  business-user IdP. An unused IAS binding on a standalone approuter is a plausible contributor
  to the logout loops chased in `e9e086d` / `b918682`. Verify before removing.

- **D. `xs-security.json` hardcodes the trial URL.** `redirect-uris` pins
  `7f4c3e60trial-dev-zgp9-fe-approuter.cfapps.us10-001…`, so any org/space/route change silently
  breaks login. Can be interpolated from `${app-api/app-uri}` by inlining the config in
  `mta.yaml`.

- **E. The BTP deploy is unscripted.** `mbt build -p=cf` and
  `cf deploy mta_archives/com.zgp9.fe.mta_1.0.0.mtar` are typed by hand; `mbt` is not a
  devDependency and there is no npm script. Phase 7.6 assumes whoever runs it knows this.

- **F. `Main.view.xml` / `Main.controller.ts` appear to be dead.** Neither is referenced in
  `manifest.json` routing nor by any other view or controller. Confirm, then delete.

- **G. `ErrorHandler` navigates to a route that does not exist.** Found 2026-07-26 during 4.2.
  `webapp/services/ErrorHandler.ts:32` calls `this.router.navTo("login", …)` on any 401/403, but
  `manifest.json` declares no `login` route — the router logs `Route with name login does not
  exist` and nothing happens. The user is left on the current view behind a "Your session
  expired. Please sign in again." dialog with no way to sign in from the app. Pre-existing and
  unrelated to the migration (it reproduces identically on 1.149), but it fires on **every**
  unauthenticated load, so it is easy to mistake for migration breakage.
  Two smaller things in the same block, worth cleaning up together: line 33 is a ternary whose
  two branches are the same string, and `handlingAuthError` is only ever reset by the MessageBox
  `onClose`, so it latches on if the dialog is dismissed some other way.

- **J. The app was letterboxed by the launchpad — rendered in a ~1280px column with dead space on
  both sides.** ✅ **FIXED AND CONFIRMED ON THE LAUNCHPAD 2026-07-28** — the app now spans the full
  window, side navigation flush left, no dead margin either side.
  FLP letterboxes embedded apps by default, constraining them to a fixed-width centred column
  rather than the full window. The app never opted out: `manifest.json` had no
  `"sap.ui": { "fullWidth": true }`. Added.
  **This is the same root cause as finding I** and the two fixes are complementary, not redundant:
  letterboxing is what reduced the content area to ~1040px and clipped VersionCompare's Action
  column in the first place. Full width gives roughly 1680px instead, but the narrowed columns stay
  — they are the margin that keeps the table safe on a small screen, on a phone, or if
  letterboxing is ever re-enabled.
  Note for anyone hitting this again: it could not be verified locally — letterboxing is applied by
  the shell and the local sandbox has never booted (3.0) — so it went out on the descriptor flag
  alone and was confirmed after deploying. **The descriptor was enough; the target mapping did not
  need touching.** Had it still letterboxed, the next place to look would have been the target
  mapping's own letterboxing setting in the FLP designer / Content Manager, which can override the
  descriptor.
  Note the app is a good candidate for full width regardless: it carries its own `sap.tnt.ToolPage`
  side navigation, so a letterboxed column spends a large share of its width on the app's own nav.

- **I. `sap.m.Table` columns wider than the launchpad clip silently — VersionCompare lost its only
  route to DetailCompare.** ✅ **FIXED 2026-07-28**, found by user testing inside FLP.
  The *Changed* and *Different* tabs declared `18+16+16+10+9 = 69rem` of fixed column widths. The
  content area inside FLP is only ~65rem once the shell bar and side nav are taken out, and
  `sap.m.Table` renders with **`table-layout: fixed`, which will not shrink below the sum of the
  declared widths** — so the table overflowed and was **clipped with no horizontal scrollbar**.
  The casualty was the last column, *Action*, and with it the **View Detail** button that is the
  only entry point to `DetailCompare`. Reproduced on 1.108: container 992px, inner table 1112px.
  Nothing was broken in the controller — `onViewDetail`, `getCompareEntryFromEvent` and the
  `detailCompare` route were all correct and unreachable.
  **Fixed two ways, deliberately belt-and-braces:** widths cut to `14+14+14+8+8 = 58rem` so the
  Action column fits, **and** the rows made `type="Navigation"` with the same press handler, so
  navigation survives any future narrowing. A `ColumnListItem` carries the same binding context the
  button did, so the handlers were not touched. This also matches JobList, which already navigates
  by chevron. Verified at 1040px: no overflow, Action column and button fully visible, chevron
  rendered, row press returns the right entry.
  **Audit of every other table in `webapp/view/`:** VersionCompare was the only one over the line.
  Next widest is `RegistryList` at **61rem**, which fits today but has almost no margin — if a
  column is ever added there, this is the failure mode it will hit. `Logs` 59rem, `JobList` 54rem,
  `RegistryDetail` 48rem.
  ⚠️ **This is invisible to every static check and to local dev**, where the browser window is
  wider than the launchpad's content area. It needs a real FLP viewport, which is how it was found.

- **H. `css/style.css` was light-theme-only on 1.108 — the whole file, not one rule.**
  ✅ **FIXED 2026-07-28**, all of it, in the same pass as 3.7. Two independent causes; the second
  was only found because the first was being fixed. Keep reading before adding any colour to that
  file — the rules it now follows are written at the top of `style.css` itself.

  **Cause 1 — the `--sap*` variables do not exist on 1.108** (detailed below).
  **Cause 2 — the dark overrides were keyed to the wrong theme.** Three blocks used
  `html.sapUiTheme-sap_horizon_dark`, but the launchpad picks the theme and `s40lp1` serves the
  **Quartz (`sap_fiori_3`) family** — 7.5 already recorded `quartz.css` / `text_styles_quartz.css`
  coming from the shell. So that selector **never matched inside FLP**, and the diff colours,
  scan-bar colours and the dark half of the brand accent were dead exactly where they were needed:
  FLP got the light `:root` values under the shell's light text. This one passes every check and
  looks correct in local dev, because local dev *does* run Horizon.

  **What was done.** Two patterns, both theme-name-free:
  - Backgrounds/borders → translucent `rgba()` tints over whatever the theme already painted, with
    **no `color` set** so text is inherited. Needed for diff rows, status rows, chart axis, AI
    bubbles. This also let the `--appDiff*` light/dark pair collapse into one set of values.
  - Foreground hues → `--app*` tokens in `:root` with a dark variant under
    `html[class*="_dark"], html[class*="_hcb"]`, which matches Horizon Dark, Quartz Dark and the
    high-contrast blacks alike. Needed only where a real hue is required (XML syntax
    highlighting), because **no single colour clears 4.5:1 on both white and near-black**.
  - `.scanActivityTotal` / `.scanActivityPeak` simply lost their `color` — `--sapTextColor` is the
    inherited colour anyway, so not setting one is both correct and shorter.

  **Verified on a live 1.108 page, 19 styled elements, both themes: zero AA failures —
  min 6.0:1 in dark (was 1.04), min 5.11:1 in light.** `ts-typecheck` clean, `ui5lint` still at
  its 2-error baseline.

  ✅ **Fully confirmed on the live launchpad, 2026-07-28**, by the in-page audit run across Home,
  VersionDetail and VersionCompare: **8 sampled elements, every one AA PASS, 6.24–15.37:1.**
  The two that matter most: `[data-diffstatus]` and `[data-linetype]` came back at **12.62**, and
  those are the rows that measured **1.04** before — the ones that were literally invisible.
  **The Quartz question below is answered by `.xmlTokTag` = 6.24.** That token is the only sampled
  value still riding on the `html[class*="_dark"]` selector; had the selector missed the shell's
  theme, the light `#0064d9` would have landed on a dark surface at ~3.3 and failed. It passed, so
  **the substring selector does match the launchpad's real theme.** The caveat below is retained
  only as the reason the selector is written that way.

  ⚠️ **Quartz could not be tested locally and this is worth knowing.** `applyTheme('sap_fiori_3_dark')`
  sets the `sapUiTheme-sap_fiori_3_dark` class but every Quartz stylesheet **404s** in local dev,
  because `ui5.yaml` declares only `themelib_sap_horizon` — the page then renders unthemed white
  and any contrast measurement taken in that state is meaningless (it produced six false failures
  before this was spotted). What *was* proven under the Quartz class is the part that matters: the
  new selector matches it and the dark token resolved to its dark value. The contrast numbers come
  from Horizon Dark, whose surface (`#1d232a`) is close enough to Quartz Dark to stand in.
  **The one thing still unconfirmed by observation is the app rendering under Quartz Dark inside
  FLP** — fold that into the 7.5 check after the next deploy.

  ⚠️ **The "Brand accent" section is inert on 1.108 and was left that way, deliberately.** It works
  by overriding `--sap*` variables, and 1.108's compiled theme CSS uses literal colours, so nothing
  consumes them: the app is un-branded inside FLP and branded on BTP/1.149. Retinting 1.108 means
  overriding UI5's own class selectors — a cosmetic project, not a readability one, and nothing
  there affects legibility. Noted in the file so it is not mistaken for a bug.

  The original finding, kept because the evidence is the reason for the rules above:
  **UI5 1.108's Horizon theme does not publish the `--sap*` CSS custom properties.** They were
  opt-in (`sap-ui-xx-cssVariables`) until ~1.120. Verified on a live 1.108 page: every one of
  `--sapTextColor`, `--sapList_Background`, `--sapErrorBackground`, `--sapContent_LabelColor`,
  `--sapNeutralBackground`, `--sapGroup_ContentBackground` … resolves to **undefined** on `<html>`,
  `<body>`, and on control DOM. A stylesheet scan found the only rules mentioning `--sapTextColor`
  anywhere are *our own consumers* — the theme never defines it.
  Consequence: **all 22 `var(--sap…)` uses in `css/style.css` silently take their hardcoded
  light-theme fallbacks**, so any FLP user on a dark theme gets light-theme colours painted behind
  the shell's light text. Measured in `sap_horizon_dark` on 1.108, all failing AA:

  | Rule | Contrast | Effect |
  | --- | --- | --- |
  | `tr[data-diffstatus="Error"]` (also `Warning`, `Success`) | **1.04–1.07** | diff rows effectively invisible — DetailCompare / VersionCompare |
  | `.scanActivityTotal`, `.scanActivityPeak` | **1.43** | Home Scan Activity figures invisible |
  | `.scanActivityCaption`, `.xmlTokPunct` | 3.27 | washed out |
  | `.xmlTokTag` / `Attr` / `Val` / `Cmt` | 2.93–3.53 | XML highlighting washed out |

  Note the comment at `style.css:71` — *"semantic theme variables keep it readable in dark mode"* —
  is **false on 1.108**; it was true when written against 1.149. `style.css:321` also paints a
  hardcoded `#ffffff` panel, and `style.css:62` (`var(--sapContent_LabelColor)`, no fallback)
  computes to nothing so the colour is simply inherited.
  This is pre-existing in the sense that the rules predate the migration, but the migration is
  what made it *visible*: on 1.149 (BTP, ABAP standalone) the variables resolve and everything
  works. **Only 1.108 hosts are affected, and every 1.108 host is FLP.**

## Open questions

- **Q1 — Does the CDN still serve 1.108.33?** ✅ **Answered 2026-07-26: no.**
  `https://ui5.sap.com/1.108.33/resources/sap-ui-version.json` returns the Demo Kit 404
  fallback page (identifiable by `data-sap-ui-onInit="module:sap/ui/documentation/bootstrap/static404"`
  and a root-relative `/resources/sap-ui-core.js` bootstrap), not a version manifest.
  1.6 took the fallback, which turned out to be preferable — the UI5 tooling resolves
  `framework.version` through SAP's artifact registry, so the CDN is not needed at all.
- **Q2 — Does 1.108 accept `manifest.json` `_version: "2.0.0"`?** ✅ **Answered 2026-07-27: yes.**
  See 1.7, now closed.
  `fiori deploy` warned before uploading: *"minUI5Version (1.108.33) is below the minimum
  (unknown) required by the app descriptor schema version 2.0.0"* — and the **`(unknown)`** is the
  informative part: the tooling has no mapping for schema version `2.0.0` either, which is exactly
  why 1.7 could not establish one. It warned and continued, and the ABAP app index updated with
  no error, so nothing rejects the descriptor outright.
  ✅ **Settled 2026-07-27 at 6.7: yes, in practice.** FLP resolved and launched the component from
  the target mapping with `_version: "2.0.0"` unchanged, on 1.108.33, with no descriptor error and
  no app-index or cache intervention. The deploy-time warning is advisory only. `_version` stays
  as it is; **do not lower it** — 1.7's contingency is no longer needed, and changing it now would
  be a speculative edit against working behaviour.
- **Q3 — Does `s40lp1` have `sap.tnt` installed?** ✅ **Answered 2026-07-27: yes**, by observation
  rather than by checking a version table. The app's entire shell *is* `sap.tnt` — `ToolPage`,
  `ToolHeader`, `SideNavigation`, `NavigationList` — and it rendered inside the launchpad on
  1.108.33 with the side navigation working (3.3, 6.7). A missing library could not have produced
  that. Same reasoning covers `sap.f` (FlexibleColumnLayout, DynamicPage) and `sap.ui.layout`
  (Splitter), both of which also rendered.
  Note: `sap.ui.table` is **no longer relevant** — see 1.4, it is not a runtime dependency.
- **Q4 — Spaces/pages or classic groups?** ✅ **Answered 2026-07-27: spaces and pages.**
  Confirmed two independent ways. `/sap/bc/ui2/flp` renders a **row of space tabs** across the top
  (`My Home`, `Controlling`, `Financial Accounting`, `Fiori Configuration`, …) rather than one
  scrolling home page of labelled group sections. And `SE93` → `/UI2/FLP*` lists `/UI2/FLPAM`
  (App Manager, only present with spaces) and `/UI2/FLP_GTP` ("Create Pages From Groups"), a
  transaction that exists solely to migrate groups into pages.
  Consequence: **6.5 becomes a page + space assignment**, and 6.6's PFCG role carries the space
  rather than a group. 6.2–6.4 are unaffected.
  Also available on this system, from the same list: `/UI2/FLPCM_CUST` / `/UI2/FLPCM_CONF` (FLP
  Content Manager), `/UI2/FLPCAT` (technical catalogs), `/UI2/FLPD_CONF` (designer, cross-client).
  **`My Home` is enabled** and offers *Edit Page* — see 6.5 for why that matters.
- **Q5 — What semantic object and action?** ✅ **Answered 2026-07-26, revised 2026-07-27.**
  **Semantic object `ZODataServiceRegistry`, action `manage`**, intent
  `ZODataServiceRegistry-manage`.
  ⚠️ **Superseded: the first answer was `ZGP9Registry` / `display`.** If you find that spelling
  anywhere, it is stale — it was renamed before any of it reached the ABAP system, so there is
  nothing to clean up there. The new name says what the app is rather than which student team
  built it, and `manage` is the honest verb: the app creates, updates, publishes and archives
  registries, so `display` understated it and would have read wrongly in the FLP's own intent
  lists.
  Written in `manifest.json` under `sap.app.crossNavigation.inbounds` (3.2) and hardcoded as the
  intent key in `webapp/test/flpSandbox.html`. It must be created identically at `/n/UI2/SEMOBJ`
  (6.1) and referenced by the target mapping (6.3). **Four places, exact match required** — plus
  a doc comment in `RegistryList.controller.ts:63` that quotes the intent in an example hash, so
  five if you count prose.
  Create authorization on `s40lp1` was confirmed before choosing it. `Z`/`Y` is not actually
  enforced by the system — the customer view already contains entries like `PommApproval` and
  `InventoryManagement1` — but the prefix is kept anyway to stay clear of the ~215 entries other
  students own on this shared training system. At 21 characters the new name is well inside the
  30-character limit `/UI2/SEMOBJ` enforces.

- **Q6 — Who can grant `ScanJob.Execute`, and does DEV-257 already have it?** ✅ **Effectively
  answered 2026-07-28: the grant happened.** *Scan Job Management* now renders inside FLP with
  real job history, so the Jobs nav entry and JobList are reachable. Recorded by observation —
  *who* granted it and to which user was never written down, so if the same wall appears on
  another account, that is still unknown. **JobDetail and the FCL two-column transition remain
  unclicked**, so 4.2/4.3 are unblocked but not yet closed. Original entry follows.
  ⚠️ open, raised
  2026-07-26 by Phase 4. Signed in as DEV-173 the Jobs nav entry is absent, so JobList, JobDetail
  and the app's only FCL two-column transition cannot be reached (4.2, 4.3). This is a role
  assignment on `s40lp1`, not a code problem. It does not block Phases 5–6 — but it is the same
  authorization work as 6.6 (the PFCG role carrying catalog + group), so **ask for both at the
  same time** rather than making two requests of whoever administers the system.
  Answer: _(record here)_

## Rollback

All Phase 1–3 work lives on the `migration` branch. `git checkout dev` restores the 1.149
build; nothing in Phases 1–4 touches the ABAP system or BTP. The first irreversible-ish step is
5.3, and even that only overwrites the existing `ZGSU26GP09_FE_1` BSP application.

The earlier caveat about uncommitted work no longer applies — Phases 1–3 are committed
(`630bf1d`, `4818ee1`) and the tree is clean, so `git checkout dev` is a genuine one-command
rollback. Re-read this if you start new work: switching branches with a dirty tree carries or
discards changes rather than parking them.

To undo just the Phase 3 launchpad embedding while keeping the 1.108 downgrade, revert
`4818ee1`. It is a clean seam — `webapp/services/Launchpad.ts` is the only new runtime module,
and every embedded branch is guarded by `isInLaunchpad()`, so reverting cannot affect the
standalone BTP or ABAP behaviour. The sandbox files (`ui5-flp.yaml`,
`webapp/test/flpSandbox.html`, the `start:flp` script) go with it; nothing else depends on them.

To undo just the typings shim and go back to precise generated event types, delete
`webapp/ui5-108-types.d.ts` and restore `@sapui5/types` in `package.json` + `tsconfig.json`.
That is the whole revert — no controller edits to unpick, which is why it was built that way.

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-07-26 | Embed properly (downgrade source to 1.108) rather than a URL-type target mapping | Requirement is an app *on* the launchpad with a real target mapping, catalog and tile; a URL target mapping launches the app but does not integrate it |
| 2026-07-26 | Hide the app's ToolPage header when embedded, keep the side nav | FLP shell bar already provides title, user, theme and logout |
| 2026-07-26 | Do not upgrade `SAP_UI` on `s40lp1` | System-wide Basis upgrade on a shared training system, and on-prem never shipped ~1.149 anyway |
| 2026-07-26 | Keep BTP on the same codebase | `minUI5Version` is a floor; 1.108-compatible source runs on 1.149 unchanged |
| 2026-07-26 | Shim the missing event types rather than rewrite 9 controllers | One deletable ambient file; keeps the delete-to-revert property. Needed typed overloads **and** a nominal brand to avoid trading 33 new lint errors for 14 fixed type errors |
| 2026-07-26 | Run the QUnit suite on 1.149 while the app runs on 1.108 | 1.108's test starter needs a `/test-resources/<ns>/` URL an application project does not serve. The tests are stub-based controller logic and never covered control rendering, so the lost signal is near zero (Phase 2.7) |
| 2026-07-26 | Leave `no-legacy-ui5-version-in-manifest` reporting | ui5lint has no per-rule disable; silencing it means ignoring `manifest.json` entirely. The finding is true and the constraint is permanent |
| 2026-07-26 | Leave `index.html` / `index-cdn.html` on kebab-case attributes | They run on CDN 1.149 where kebab-case works; editing BTP's entry file mid-migration is risk without present benefit. Recorded as a prerequisite in 4.6 |
| 2026-07-26 | Build a local FLP sandbox (`ui5-flp.yaml` + `flpSandbox.html`) before writing Phase 3 | The 3.3/3.5/3.6 paths are unreachable without a `sap.ushell.Container`, so each bug would otherwise cost an ABAP deploy cycle. Same bet as 1.6, which paid off three times in 4.6 |
| 2026-07-26 | **Abandon that sandbox** and verify Phase 3 in the real FLP at 7.1 instead (option (b)) | It never booted: `sandbox.js` blocks Core on an `xx-bootTask` whose `sap/ushell/Container` require never settles, with an empty console and nothing to grep for. The bet was timeboxed and overran it. Accepted cost: embedding bugs now cost an ABAP deploy round trip to find (3.0) |
| 2026-07-26 | Keep the broken sandbox files rather than delete them | The sound half is real and reusable — `sap.ushell@1.108.33` resolves from the artifact registry and the whole library serves. Only the boot handshake is unsolved, and the diagnosis plus everything already ruled out is written into both files |
| 2026-07-26 | Declare `sap.ushell` in `ui5-flp.yaml` only, never in `ui5.yaml` | Adding it to the build config pulls `sap.ui.comp`, `sap.ui.table`, `sap.ui.mdc`, `sap.viz` and more in as project dependencies — the 1.4 mistake. On the real launchpad the shell supplies `sap.ushell`; the app must never declare it |
| 2026-07-26 | Delete `MainShell.getCurrentHash()` rather than make it FLP-safe | It was dead code — one grep hit, the declaration. Section highlighting already runs off route parameters and was never broken under FLP. Half of 3.6 was a non-bug |
| 2026-07-26 | Keep the app header at phone width even when embedded | The menu button is the only way to reopen the side nav below 600px, so hiding the whole header would leave an embedded phone user with no navigation. The plan counted four duplicated controls and missed this fifth, non-duplicated one |
| 2026-07-27 | Verify Phase 3 in the real launchpad rather than rebuild the sandbox — **outcome recorded** | The 2026-07-26 bet (option (b)) paid off. Five embedded branches executed for the first time in production; **four were correct**, no deploy round trip was needed, and the fifth (3.4) is a contradiction *between* 3.3 and 3.4 that a working sandbox would not have caught either |
| 2026-07-27 | Use `My Home` + App Finder for 6.5 before building a space and page | Proves the catalog → target mapping → role → intent chain in minutes and isolates any failure to 6.1–6.4. The dedicated space (route b) is presentation, not function, and is still open |
| 2026-07-27 | Rename the semantic object `ZGP9Registry`/`display` → **`ZODataServiceRegistry`/`manage`** | Names what the app is rather than which student team built it, and `manage` matches what it actually does (create, update, publish, archive) where `display` understated it. Free to change now — nothing had reached `/n/UI2/SEMOBJ` yet, so it is four file edits and no ABAP cleanup (Q5) |
| 2026-07-26 | Clear both `[FUTURE FATAL]` assertions (`core:Item width`, missing `templateShareable`) now rather than filing them | Both are one-line view edits found by the same console pass, both are on the migration path, and `[FUTURE FATAL]` means a later UI5 throws where 1.108 only warns. The `width` was provably dead — the enclosing `Select` already sets it (4.6 items 5–6) |
| 2026-07-26 | Proceed to Phase 5 with JobList/JobDetail unverified rather than wait for a role | The blocker is a PFCG role assignment on a shared university system, not a code or migration problem, and nothing in Phases 5–6 depends on those two views. Cost is written down: they reach FLP unexercised, joining the Phase 3 branches already in that state (4.2, Q6) |
| 2026-07-26 | Replace `sap-icon://box` → `inventory` and `sap-icon://lines` → `text-align-justified` rather than shipping blank icons | Neither name exists in the 1.108 icon font, and a missing icon renders as nothing with only a console warning — it passes every static check and reaches the launchpad silently. Both replacements exist in 1.108 *and* 1.149, so one codebase still serves both targets (4.6 item 4) |
| 2026-07-26 | ~~Guard the AI chat by **origin**, not by probing `/ai/*` at startup~~ | **Superseded 2026-07-27** — the decision to hide the feature was reversed in favour of making it work. The origin-check reasoning survives, but as the mechanism that picks a *base path* rather than one that disables a button |
| 2026-07-26 | ~~**Defer building that guard until after the migration closes**~~ | **Superseded 2026-07-27**, see below |
| 2026-07-27 | **Make the AI chat work on ABAP rather than hide it**, via an ICF handler (`ZCL_GP9_AI_PROXY`) + SM59 destinations | Hiding it removed a working feature from two of the three hosts to avoid an error message. The invariant that forces the design is that the key must never reach the browser, and the only way to honour that from the ABAP origin is a server-side component there. Unblocked by confirming s40lp1 has outbound HTTPS — SM59 to `api.groq.com:443` returned HTTP 404 in 284 ms (3.7) |
| 2026-07-27 | Keep the AI call **same-origin** on every host rather than calling the BTP approuter cross-origin from ABAP | The approuter's `/ai/*` routes are `authenticationType: xsuaa`, so a cross-origin fetch gets a login redirect it cannot follow; making it work needs CORS + `SameSite=None` + a second live session, and still fails silently on expiry. It would also make the ABAP/FLP deliverable depend on BTP uptime (3.7) |
| 2026-07-27 | Pin each SM59 destination to the **full** `chat/completions` path, not the host | A destination then cannot be steered at the providers' key-management endpoints on the same host (`GET /api/v1/key` returns the credit balance). Same rule the approuter routes already follow, enforced one layer lower so it holds even if the handler misroutes |
| 2026-07-27 | Accept plaintext keys in `ZGP9_AI_CFG` with a table authorization group | Genuinely weaker than BTP, where the key lives in a destination no user can query. Recorded as the honest cost of the ABAP path rather than presented as equivalent (README → ABAP setup) |
| 2026-07-28 | Move the AI chat input row out of `Dialog`'s `footer` aggregation into `content` rather than branching on UI5 version | 1.108 has no `Dialog.footer` (added ~1.110), and a missing aggregation makes the XML processor load the element as a control — a 404 that rejects `Fragment.load` and produces a dead button with no visible error. A Toolbar in `content` plus one CSS rule renders the same on 1.108 and 1.149, so one fragment still serves both targets. Same reasoning as the 4.6 icon swaps (3.7) |
| 2026-07-28 | Style the AI chat with translucent tints and no explicit `color`, instead of `var(--sap*)` theme variables | 1.108 does not publish the `--sap*` custom properties at all, so every `var(--sapX, <light fallback>)` painted light-theme colours behind the dark shell's light text — measured 1.04–1.08:1. A translucent tint over the theme's own background with inherited text colour is correct on any theme and any UI5 version, and needs no theme-name detection (3.7, finding H) |
| 2026-07-28 | ~~Fix only the AI chat rules and file the rest as finding **H**~~ | **Superseded the same day** — the sweep was requested and done; H is closed |
| 2026-07-28 | Opt out of FLP letterboxing with `sap.ui/fullWidth`, and **keep** the narrowed VersionCompare columns anyway | Letterboxing is what produced finding I — a ~1280px column leaves ~1040px of content once the app's own side nav is subtracted. Full width fixes the wasted space and gives the tables room, but the narrower columns stay as the margin that protects small screens, phones, and any future re-enabling of letterboxing. Fixing only one of the two would leave the other failure live (findings I and J) |
| 2026-07-28 | **Drop BTP from the plan entirely** (7.6) | Owner's decision — the target is the launchpad and BTP is not going to be used. Accepted cost, recorded rather than argued: the "`minUI5Version` is a floor, not a pin" claim stays permanently unproven end to end, and nothing verifies the approuter deployment. Costs nothing while FLP is the only host, and the 1.108 source constraint is imposed by the launchpad anyway. No BTP config was deleted — `mta.yaml`, `approuter/` and the `/ai/` base path all remain, the last of which local dev needs regardless |
| 2026-07-28 | Replace the OpenRouter model list with `openai/gpt-oss-20b:free` and `inclusionai/ling-3.0-flash:free` | Two of the previous three slugs were provably dead and the third unverified; free-tier slugs churn. Reached only when Groq is rate-limited, so a rotted entry is invisible until the worst possible moment — which argues for keeping this list short and re-checking it whenever the AI chat fails only under load |
| 2026-07-28 | Fix VersionCompare's unreachable DetailCompare link by **both** narrowing the columns and making the row navigable | Narrowing alone restores the button but leaves the same trap one added column away; a navigable row alone leaves a table that still overflows. The row also matches JobList's existing chevron pattern and reuses the handler unchanged, since a `ColumnListItem` carries the binding context the button did (finding I) |
| 2026-07-28 | Match dark themes by substring (`html[class*="_dark"]`) rather than by theme id | The launchpad picks the theme and serves the Quartz (`sap_fiori_3`) family, so `html.sapUiTheme-sap_horizon_dark` matched nothing there — three blocks were dead in FLP while looking correct in local dev, which runs Horizon. A substring match covers Horizon Dark, Quartz Dark and the high-contrast blacks without the app having to know which one it got (finding H) |
| 2026-07-28 | Leave the "Brand accent" block inert on 1.108 rather than reimplement it | It retints by overriding `--sap*` variables, which 1.108's compiled theme CSS never reads. Making it work there means overriding UI5's own class selectors — a cosmetic project with no legibility consequence, and the app is still branded on 1.149. Written into the file so it is not mistaken for a bug (finding H) |
| 2026-07-28 | Surface `Fragment.load` failures instead of caching the rejected promise | The cached rejection made every click after the first a silent no-op, which disguised a hard 404 as an unresponsive button and cost the whole diagnosis. Clearing the cache also makes the action retryable (3.7) |
| 2026-07-27 | **Delete** the unreachable launchpad logout branch (3.4) rather than keep it as a seam | It was dead code: the only control that could trigger it is hidden exactly when it would fire. Same call already made for `MainShell.getCurrentHash()` in 3.6. Logout in FLP is the shell's responsibility, so there is nothing for the app to do — which also closes 7.3 as not applicable |
