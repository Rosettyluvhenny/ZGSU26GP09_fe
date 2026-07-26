# Fiori Launchpad Embedding — Migration Tracker

Working document. Update the status marks as you go; this file is the single source of
truth for where the migration stands and what order the remaining work happens in.

---

## ▶ RESUME HERE

**Last updated:** 2026-07-26

**Where things stand:** Phases 0, 1 and 2 are complete and **committed** (`630bf1d`). The app
runs on UI5 1.108.33 locally. **Phase 3 is code-complete for 3.1–3.6** and passes every static
check, but is **not yet runtime-verified** — see "Next action". 3.7 is deliberately deferred to
after the migration; read it before assuming the AI chat is broken by accident.

**Branch:** `migration`. Phase 1–2 sits on `630bf1d`; Phase 3 is on top of it.

> ⚠️ **All Phase 3 work is UNCOMMITTED.** New files: `webapp/services/Launchpad.ts`,
> `webapp/test/flpSandbox.html`, `ui5-flp.yaml`. Modified: `Component.ts`, `models.ts`,
> `MainShell.controller.ts`, `MainShell.view.xml`, `RegistryList.controller.ts`,
> `manifest.json`, `ui5.yaml`, `package.json`, and this file. Commit before switching branches.
> Verify with `git status`; if the tree is clean, this warning is stale and someone committed.
>
> *(The previous version of this warning covered Phase 1–2 and is now obsolete — that work is
> in `630bf1d`.)*

**Next action:** Phase 4.2–4.4 — the remaining standalone click-through on 1.108 via
`npm start`. That needs the university network for a reachable ABAP backend; without it the
views load but stay empty. Then Phase 5 (ABAP deploy).

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
npm run start:flp        # opens the FLP sandbox on 1.108.33 — embedded behaviour (3.0)
```

All five of the non-interactive checks above were green as of this update, with Phase 3 applied.

Two console errors on `npm start` are expected and environmental, not regressions:
`GET …/$metadata` and `CSRF fetch failed (502)`, both because no ABAP backend is reachable
without the university network.

Operational note: `npm start` and `npm run test-unit` both bind port 8080, and the test runner
starts its own server. Stop the dev server before running the tests, or the run fails in
confusing ways.

**Scope note — unit tests are NOT ours.** Another team member owns the QUnit suite. Do not
spend time on the 4 pre-existing `Home – bucketScanTrend` failures (diagnosed in 0.3) or on
making the suite run under 1.108 (closed off in 2.7). Just don't make it worse than 78/82.

**Read before touching code:** the "Key consequence" note below, then Phase 2.3 (why
`webapp/ui5-108-types.d.ts` is shaped the way it is — it looks over-engineered and is not) and
Phase 4.6 (three non-obvious 1.108 traps already hit, one of which fails completely silently).

**Also see "Deferred findings"** near the end: six pre-existing issues in the BTP/deploy setup,
unrelated to this migration but real. Two of them intersect this plan — **A** must be read before
doing 3.4, and **B** explains why `git status` keeps showing a modified `.zip`.

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
- [~] 1.7 `manifest.json:2` `_version: "2.0.0"` — **deliberately left unchanged.** I could
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

**Status: 3.1–3.6 are code-complete and pass every static check** (`ts-typecheck` clean, `lint`
back to the 1 pre-existing error, `ui5lint` at its 2 deliberate ones, `test-unit` at the 78/82
baseline). They stay `[~]` rather than `[x]` because the legend reserves `[x]` for *verified*.

⚠️ **None of the embedded branches has ever executed.** The local sandbox that was supposed to
exercise them does not boot (3.0), so `isInLaunchpad()` has only ever returned `false` in any
code that has actually run. Every `isInLaunchpad()`-true path — the hidden header, the ushell
logout, the FLP-shaped hash — is **written but unexercised**. `sap.ui.require.toUrl` (3.5) is
the one exception: it runs on both branches and is exercised by ordinary `npm start`.

By decision (option (b), 2026-07-26) these are verified **inside the real launchpad at 7.1**.
Flip them to `[x]` there, not before. The accepted cost is that an embedding bug now surfaces
after an ABAP deploy rather than locally — budget a round trip or two in Phases 5–7.

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
        under the intent `ZGP9Registry-display`, so **the semantic object now appears in a
        fourth place** — keep it in step with 3.2, 6.1 and 6.3.
      - `ui5-flp.yaml` — a serve-only config whose only difference from `ui5.yaml` is that it
        declares `sap.ushell`. **Deliberately not added to `ui5.yaml`:** that would pull
        `sap.ui.comp`, `sap.ui.table`, `sap.ui.mdc`, `sap.suite.ui.commons`, `sap.viz` and a
        dozen more in as declared project dependencies — precisely the mistake avoided in 1.4.
        On the real launchpad the shell supplies `sap.ushell`; the app must never declare it.
      - `npm run start:flp`. Excluded from the build in both yamls, like `index-local.html`.
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
- [~] 3.1 One `isInLaunchpad()` helper — `webapp/services/Launchpad.ts`. Exports
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
- [~] 3.2 `sap.app.crossNavigation.inbounds` in `manifest.json` — **`ZGP9Registry` /
      `display`** (Q5), with title, subtitle, icon and an empty-parameter signature at
      `additionalParameters: "allowed"`. `sap.ui.icons` filled with
      `sap-icon://business-objects-experience`, matching the Registry side-nav entry.
      Must match the target mapping built in Phase 6.
- [~] 3.3 Hide the `tnt:ToolPage` header when embedded, keep `SideNavigation`.
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
- [~] 3.4 Logout — `webapp/controller/MainShell.controller.ts`. `logoutFromLaunchpad()` when
      embedded, `window.location.assign("/logout")` on BTP. The `redirectToLogout()` seam is
      kept; `MainShell.qunit.ts:58` stubs it, so the branch never runs under the test runner.
      The stale comment was rewritten: per deferred finding **A** the live config is
      `approuter/xs-app.json` with `logoutPage: "/logout.html"`, not the root `xs-app.json`'s
      `"/"`. Confirmed from `mta.yaml:5-11`, which deploys a **standalone** approuter module —
      so the root file, though bundled into the app zip by `ui5-task-zipper`, is not what
      serves. Deduplicating the two files is still open; it touches the BTP bundle and was
      deliberately left out of this branch.
- [~] 3.5 Stylesheet path — `webapp/Component.ts` now uses
      `sap.ui.require.toUrl("com/zgp9/fe/css/style.css")` instead of resolving against
      `document.baseURI`, which under FLP is the launchpad's document rather than the app root.
- [~] 3.6 Direct hash reads. **Only half of this item was a real bug.**
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
- [~] 3.7 AI chat — **approach decided, implementation DEFERRED to after the migration closes
      (decided 2026-07-26).** `webapp/services/AiChatService.ts:46,55` post to `/ai/*`, which
      only the BTP approuter serves. There is no host guard, so on ABAP it throws.
      **Agreed fix, to be built later:** hide the feature whenever the app is not running on the
      BTP approuter, using an **origin check, not a startup probe** — the `/ai/*` routes exist
      only on the approuter (confirmed in `approuter/xs-app.json` and the `AI_GROQ` /
      `AI_OPENROUTER` destinations at `mta.yaml:69-90`), so the origin already answers the
      question and a probe would spend a request per page load re-asking it.
      **Consequence of deferring — do not re-diagnose this as a migration regression.** Until it
      is built, the AI chat is *live but broken* on ABAP. Expect it to fail at **5.4** and
      **7.1**, in exactly three places: the AI chat button on `VersionDetail`, `ModelExplorer`
      and `DetailCompare` (all open `webapp/view/fragments/AiChatDialog.fragment.xml`). BTP is
      unaffected, and local `npm start` is unaffected because `ui5-middleware-sap-proxy` serves
      the same `/ai/*` paths from `.env`.
      Reopen this item at 7.7, alongside the README fixes.

**Gate:** app builds and starts with no *new* console errors beyond the two environmental ones
(`$metadata`, `CSRF 502`) that appear whenever no ABAP backend is reachable. The deferred 3.7
failure does not count against this gate locally — it only surfaces on ABAP.

---

## Phase 4 — Local verification on 1.108

1.6 is done, so this is now live: `npm start` runs the app on 1.108.33. This is where control
drift across ~40 releases shows up, and it has already produced three real fixes (4.6).

- [x] 4.1 Confirmed the running UI5 really is 1.108: `/resources/sap-ui-version.json` reports
      library versions **1.108.30**, which is the OpenUI5 line inside the SAPUI5 1.108.33
      distribution (the two version series differ — do not expect 1.108.33 there).
      Note: `ui5-test-runner` prints its own unrelated "UI5 version used by the local server"
      line, which reported 1.150.0. Ignore it; the served framework is what matters.
- [ ] 4.2 Click through all **11 reachable** views: Home ✅ (verified rendering), RegistryList,
      RegistryDetail, VersionDetail, ModelExplorer, VersionCompare, DetailCompare, JobList,
      JobDetail, Logs — plus MainShell and App, which are the shell and root and so are
      exercised by all of the above.
      `Main.view.xml` is **not** in this list: it has no route and no references, so it cannot be
      reached. See deferred finding F.
- [ ] 4.3 Exercise `sap.f` FlexibleColumnLayout column transitions and `DynamicPage`
      collapse — these existed in 1.108 with fewer properties than 1.149
- [ ] 4.4 Exercise the `sap.ui.layout.Splitter` split views and the responsive breakpoints
      driven by `Component.ts:57-75` (`isPhoneWidth` / `isNarrowWidth`)
- [x] 4.5 `npm run test-unit` at **78/82** — the baseline, with the same 4 pre-existing
      `Home – bucketScanTrend` failures and nothing new. **Not our scope beyond this:** the
      QUnit suite is owned by another team member. The bar for this migration is "no worse than
      78/82", not "green". Runs on 1.149 by design (2.7).
- [~] 4.6 Differences found so far. **Three genuine 1.108 runtime incompatibilities, all fixed**
      — every one of them found locally, each of which would otherwise have cost an ABAP deploy
      cycle. This is the entire payoff of step 1.6.

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

      Still outstanding: 4.2–4.5. The Home view renders correctly end to end (shell, side nav,
      dashboard tiles, Scan Activity, Quick Actions). Remaining console errors are purely
      environmental — `GET …/$metadata` and `CSRF fetch failed (502)` — because no ABAP backend
      is reachable from this machine. Confirm against a real backend before trusting them.

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

> ⚠️ **7.1–7.3 now carry the entire verification burden for Phase 3.** The local sandbox that
> was meant to catch these never booted (3.0), so every `isInLaunchpad()`-true branch reaches
> the real launchpad completely unexercised. Treat this as first-run code, not as a regression
> pass: expect to find bugs here, and budget deploy round trips (5.3 + 5.5) to fix them.

- [ ] 7.1 All 13 views again, this time **inside** FLP — 3.5 and 3.6 bugs only appear here.
      Specifically:
      - **3.5** — is the app *styled*? A stylesheet 404 renders it unstyled rather than broken,
        which is easy to walk past. Confirm `css/style.css` is 200 in the network tab, not just
        that the page "looks fine".
      - **3.6** — open a deep link with a status filter and confirm the filter actually applies.
        The FLP hash is `#ZGP9Registry-display&/registries?status=Published`.
      - Flip 3.1–3.6 from `[~]` to `[x]` only once this passes.
- [ ] 7.2 FLP shell bar present, app header hidden, side nav working (3.3).
      Check **both widths**: on desktop the app header should be gone entirely; below 600px it
      should reappear carrying only the menu button, which is the sole way to reopen the side
      nav. Also confirm the desktop side nav is still usable while no longer collapsible — that
      trade-off was accepted deliberately, see 3.3.
- [ ] 7.3 Logout from inside FLP ends the session properly (3.4).
      This is the branch most likely to be wrong: `sap.ushell.Container.logout()` has never run.
      If it fails, check first whether `logout` exists on the container at all in 1.108 — the
      shipped typings generate it as `logout: undefined`, which is why Launchpad.ts declares
      its own minimal interface rather than trusting them.
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

## Deferred findings — out of scope here, but real

Found while surveying the deploy setup before this migration started. **None is caused by the
migration** and none blocks it, but they are real and would otherwise be lost. Two of them
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

## Open questions

- **Q1 — Does the CDN still serve 1.108.33?** ✅ **Answered 2026-07-26: no.**
  `https://ui5.sap.com/1.108.33/resources/sap-ui-version.json` returns the Demo Kit 404
  fallback page (identifiable by `data-sap-ui-onInit="module:sap/ui/documentation/bootstrap/static404"`
  and a root-relative `/resources/sap-ui-core.js` bootstrap), not a version manifest.
  1.6 took the fallback, which turned out to be preferable — the UI5 tooling resolves
  `framework.version` through SAP's artifact registry, so the CDN is not needed at all.
- **Q2 — Does 1.108 accept `manifest.json` `_version: "2.0.0"`?** ⚠️ open, deferred by
  design. See 1.7 for why it was left alone and what symptom to watch for at Phase 5.5.
  Answer: _(record here)_
- **Q3 — Does `s40lp1` have `sap.tnt` installed?** Standard in `SAP_UI`, but confirm before
  assuming; Phase 6 fails obscurely if a declared library is missing.
  Note: `sap.ui.table` is **no longer relevant** — see 1.4, it is not a runtime dependency.
  Answer: _(record here)_
- **Q4 — Spaces/pages or classic groups?** If the system has spaces and pages switched on,
  6.5 becomes a page/space assignment instead of a group.
  Answer: _(record here)_
- **Q5 — What semantic object and action?** ✅ **Answered 2026-07-26.**
  **Semantic object `ZGP9Registry`, action `display`.** Now written in `manifest.json` under
  `sap.app.crossNavigation.inbounds` (3.2). It must be created identically at `/n/UI2/SEMOBJ`
  (6.1) and referenced by the target mapping (6.3) — three places, exact match required.
  Also hardcoded as the intent key in `webapp/test/flpSandbox.html`, so **four** places if the
  name ever changes.
  Create authorization on `s40lp1` was confirmed before choosing it. `Z`/`Y` is not actually
  enforced by the system — the customer view already contains entries like `PommApproval` and
  `InventoryManagement1` — but the prefix is kept anyway to stay clear of the ~215 entries other
  students own on this shared training system.

## Rollback

All Phase 1–3 work lives on the `migration` branch. `git checkout dev` restores the 1.149
build; nothing in Phases 1–4 touches the ABAP system or BTP. The first irreversible-ish step is
5.3, and even that only overwrites the existing `ZGSU26GP09_FE_1` BSP application.

Caveat while the work is uncommitted (see RESUME HERE): switching branches right now would
carry or discard the changes rather than cleanly park them. Commit on `migration` first, then
`git checkout dev` is a genuine one-command rollback.

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
| 2026-07-26 | Guard the AI chat by **origin**, not by probing `/ai/*` at startup | The routes exist only on the BTP approuter, so the origin already determines availability; a probe would cost a request on every page load to learn what is statically known |
| 2026-07-26 | **Defer building that guard until after the migration closes** | It is a pre-existing ABAP-only defect, not caused by or blocking the embedding work. Deferring keeps Phase 3 to launchpad-integration changes only. Cost is a known, written-down failure at 5.4 / 7.1 — see 3.7 |
