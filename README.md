# Metadata Manage Center (`com.zgp9.fe`)

A SAPUI5 application for managing OData service registries — registries, versions, model
exploration, version comparison, scan jobs and logs. It runs **embedded in the SAP Fiori
Launchpad** on `s40lp1.ucc.cit.tum.de` (client 324), reached through a tile → intent → target
mapping → component, and also standalone from the ABAP BSP URL.

Built with TypeScript. The central entry point for TypeScript with UI5 is
[ui5.github.io/typescript](https://ui5.github.io/typescript).

---

## ⚠️ Read this before changing any code

**The source is constrained to the SAPUI5 1.108.33 API surface.** The launchpad bootstraps UI5
once for the whole shell, from the ABAP server, and `s40lp1` serves 1.108.33. An app cannot bring
its own UI5 version into an existing launchpad page, so anything using a post-1.108 API breaks
when embedded.

This is **not** a downgrade of the app. `minUI5Version` is a *floor*, not a pin — code written to
the 1.108 surface also runs on 1.149. One codebase serves both.

Two consequences that bite in practice:

- **Static checks cannot see most 1.108 problems.** `tsc` and ESLint do not read `.view.xml`,
  `.fragment.xml` or `.css` at all, and 1.108's failure mode is usually silent — a dropped
  bootstrap attribute, a missing icon glyph, an aggregation that does not exist, an unresolved CSS
  variable. **If you add or edit a view, fragment or stylesheet, open it on `npm start` and read
  the console.** That is the only check that catches this class of bug.
- `npm run ui5lint` **exits 1 by design**, with exactly 2 errors. Both are true statements about
  deliberate, permanent constraints (the 1.108 version floor, and `synchronizationMode` which
  1.108 *requires* and later versions deprecated). Expect 2; investigate 3.

The full migration history, every trap hit, and the reasoning behind each decision is in
[`FLP_MIGRATION.md`](FLP_MIGRATION.md). Read Phase 4.6 before debugging anything version-related.

---

## Setup

```sh
npm install
```

For the AI assistant in local development, also:

```sh
cp .env.example .env   # then paste your keys
```

`.env` is git-ignored. Never put a provider key anywhere under `webapp/` — it would land in
`Component-preload.js` and its sourcemaps.

## Run locally

```sh
npm start
```

Opens `index-local.html` on **UI5 1.108.33**, matching the launchpad. This is the entry point to
develop against.

### Entry points, and which UI5 each loads

| File | Bootstraps | Used by |
| --- | --- | --- |
| `index-local.html` | tooling-served `resources/` at **1.108.33** | `npm start` |
| `index.html` | **CDN 1.149.1**, hardcoded | ABAP standalone URL |
| `index-cdn.html` | CDN 1.149.1 | `npm run start-cdn` |

**The Fiori Launchpad uses none of these.** Embedding loads `Component.js` directly into the
shell's already-running UI5 — which is why the ABAP standalone URL (1.149) and the launchpad
(1.108) can disagree, and why a bug can be invisible on one and fatal on the other.

`index.html` is deliberately left on the CDN so the standalone URL keeps working unchanged. To
align it with the launchpad you would point it at
`/sap/public/bc/ui5_ui5/resources/sap-ui-core.js` — but that path is ABAP-only, and its bootstrap
attributes must be converted to the legacy single-token spellings first (`resourceroots`,
`oninit`, `compatversion`, `frameoptions`), or you get a blank page with a clean console.

### Backend data

The app talks to `s40lp1` through `ui5-middleware-sap-proxy`. On first load the browser shows a
**Basic Auth prompt** — enter your ABAP user. Until you do, every list is empty and every
permission is `false`, and the console shows a `$metadata` error plus `CSRF fetch failed (502)`.
Those two mean *unauthenticated*, not *unreachable*.

The prompt does **not** appear in a headless or automation browser — it renders a "Logon failed"
body instead. Sign in from a real browser window.

## Check the code

```sh
npm run ts-typecheck
```

```sh
npm run lint
```

```sh
npm run test-unit
```

Expected baselines: typecheck **clean**; lint **1 error** (`Home.controller.ts:133`, pre-existing);
`ui5lint` **2 errors** (deliberate, see above); `test-unit` **78/82** — the 4 failures are stale
tests owned by another team member, do not fix them, just do not make it worse.

> `npm start` and `npm run test-unit` both bind port 8080, and the test runner starts its own
> server. Stop the dev server before running tests.

## Build

```sh
npm run build
```

Output goes to `dist/`.

---

## Deploy to ABAP / Fiori Launchpad

```sh
npm run deploy
```

This runs `npm run build` then `fiori deploy --config ui5-deploy.yaml`.

**Run it from a real terminal** — it prompts for the password on stdin and cannot be driven from a
non-interactive shell. Credentials are the **on-prem ABAP user**, not a BTP login. Two
`No credential found` warnings and an initial `401` are normal: the tooling probes its credential
store, finds nothing, then prompts.

| Setting | Value |
| --- | --- |
| BSP application | `ZGSU26GP09_FE_1` |
| Package | `ZGSU26GP09` |
| Transport | `S40K919517` |
| Standalone URL | `/sap/bc/ui5_ui5/sap/zgsu26gp09_fe_1/index.html` |
| Launchpad | `/sap/bc/ui2/flp` |

The package is a property of the **existing ABAP object**, not of the deploy config — editing
`ui5-deploy.yaml` alone does not move an app between packages. Reassign in `SE03` as well.

### Launchpad configuration (one-time, already done)

| Step | Transaction | Value |
| --- | --- | --- |
| Semantic object | `/n/UI2/SEMOBJ` | `ZODataServiceRegistry` |
| Catalog | `/UI2/FLPD_CUST` | `ZGSU26GP09_FE_CAT` |
| Target mapping | `/UI2/FLPD_CUST` | action `manage`, URL `/sap/bc/ui5_ui5/sap/zgsu26gp09_fe_1`, Component ID `com.zgp9.fe` |
| Tile | `/UI2/FLPD_CUST` | static app launcher, **navigate by intent** |
| Role | `PFCG` | a role carrying the catalog — see below |

The intent `ZODataServiceRegistry-manage` must match **character for character** in
`manifest.json` (`sap.app.crossNavigation.inbounds`), `/n/UI2/SEMOBJ` and the target mapping.

⚠️ **The tile must navigate by intent, not by URL.** A URL tile launches the app standalone in a
bare tab, bypassing the target mapping. It looks like success — the app loads and works — while
every embedded code path stays inactive. If the app ever appears without the FLP shell bar, check
the tile's navigation type first.

### Giving a user access

Two independent layers:

1. **Reaching the app** — a PFCG role carrying catalog `ZGSU26GP09_FE_CAT`. Add it via
   `PFCG` → role → **Menu** → the `Transaction` button's **▾** dropdown → *SAP Fiori Launchpad →
   Launchpad Catalog*, with **Include Applications** ticked. Then **Authorizations → Expert Mode →
   "Read old status and merge with new data" → Generate**, and **Save**.
2. **What they can do inside it** — authorization object `Z_REGISTRY` (class `ZGP9`), whose
   `ACTVT` and `ZGP9ACTION` values the backend turns into the `Registry.Create`, `Registry.Update`
   and `ScanJob.Execute` permissions that `MainShell.loadGlobalPermissions()` reads. Missing
   permissions hide UI rather than erroring: no Jobs nav entry, no Create button, no Actions
   column.

⚠️ **`User Comparison → Full Comparison` (User tab, or transaction `PFUD`) is silently fatal to
skip.** Without it the assignment never reaches the user buffer and the app is simply absent from
the App Finder, with no error anywhere to explain why.

After any role change, **hard-refresh the launchpad (Ctrl+Shift+R)** — a tab loaded earlier serves
cached user content and the app appears to be missing.

### Changing the app title

The title lives in two places that must both be updated:

- `appTitle` in `webapp/i18n/i18n.properties` **and** `webapp/i18n/i18n_en.properties` — feeds
  `sap.app.title`, the inbound title and the app's own header. Requires `npm run deploy`.
- The **tile** title in `/UI2/FLPD_CUST` — Designer content, independent of the deploy.

### BTP

BTP is **no longer a deployment target** (owner's decision). `mta.yaml`, `xs-app.json`,
`xs-security.json` and `approuter/` remain in the tree and still build, but nothing verifies them.
Note the `/ai/` base path is **not** BTP-only code — local `npm start` uses it too, so it must stay
regardless.

---

## AI Assistant Configuration

The AI chat never calls the providers directly. Whatever host serves the app puts a
component in front of the provider that attaches the API key server-side, so **no key is
ever shipped to the browser**. Do not reintroduce a key into `webapp/` — anything under
`webapp/` ends up in `Component-preload.js` and its sourcemaps, readable by any user.

There are three such hosts, and the frontend picks the right base path itself:

| Host | Base path | Key attached by |
| --- | --- | --- |
| ABAP — standalone URL **and** FLP | `/sap/bc/zgp9_ai/` | `ZCL_GP9_AI_PROXY`, from its SM59 destination |
| Local `npm start` | `/ai/` | `ui5-middleware-sap-proxy`, from `.env` |
| BTP approuter (retained, unused) | `/ai/` | `AI_GROQ` / `AI_OPENROUTER` destinations |

The switch is `resolveAiBasePath()` in `webapp/services/AiChatService.ts`. It keys off the
app's own UI5 resource root (`/sap/bc/ui5_ui5/` is the ABAP BSP runtime path and exists
nowhere else), not off the hostname — hostnames move, and embedded in a launchpad
`location` describes the shell rather than this app.

> ⚠️ **The model list rots.** Free-tier provider slugs are withdrawn without notice, and the
> OpenRouter path is only reached when Groq is rate-limited — so a dead slug stays invisible until
> the worst possible moment. If the AI chat fails only under load, re-check `PROVIDERS` in
> `AiChatService.ts` before anything else.

### ABAP setup (once per system)

Needed for the AI chat to work on the ABAP standalone URL and inside the Fiori Launchpad.
Without it those hosts have no handler at all and every request 404s.

**Prerequisite — outbound HTTPS.** `s40lp1` must be able to reach the providers. Verify in
`SM59` before anything else: create a type **G** destination, Host `api.groq.com`, Port
`443`, **Logon & Security → SSL: Active** with `DFAULT SSL Client (Standard)`, then
**Connection Test**. Any HTTP status back — including **404** — means the connection and
the TLS handshake succeeded and you are good. A timeout or `NIECONN_REFUSED` means outbound
is blocked; check `icm/HTTP/proxy_host` in `RZ11` for a system proxy before giving up.

**1. Config table `ZGP9_AI_CFG`** (SE11, delivery class `C`, client-dependent):

| Field | Key | Type | Notes |
| --- | --- | --- | --- |
| `MANDT` | ✓ | `MANDT` | |
| `PROVIDER` | ✓ | `CHAR 20` | `groq` / `openrouter` — lowercase, matches the URL segment |
| `RFCDEST` | | `RFCDEST` | the SM59 destination name |
| `API_KEY` | | `CHAR 255` | the provider key |

⚠️ The key sits in plaintext in a table, readable by anyone with `SE16` on it. Assign a
table **authorization group** (`SE54`) and keep it off broad display roles. This is the
weakest link in the ABAP path, and weaker than the BTP one where the key lives in a
destination no user can query. Recorded as the honest cost of this approach, not hidden.

**2. SM59 destinations**, both type **G**, SSL **Active**:

| Field | `ZGP9_AI_GROQ` | `ZGP9_AI_OPENROUTER` |
| --- | --- | --- |
| Host | `api.groq.com` | `openrouter.ai` |
| Port | `443` | `443` |
| Path Prefix | `/openai/v1/chat/completions` | `/api/v1/chat/completions` |

The Path Prefix is the **full** endpoint path, not just the version prefix. That is
deliberate: it pins each destination to `chat/completions` so it cannot be steered at the
providers' key-management endpoints, which live on the same host — `GET /api/v1/key`
returns your credit balance.

If the connection test returns an SSL error rather than a status code, import the host's CA
certificate into `STRUST` → **SSL client SSL Client (Standard)**.

**3. ICF node** (`SICF`): create service `zgp9_ai` under `default_host/sap/bc/`, handler
class **`ZCL_GP9_AI_PROXY`**, logon procedure *Standard* so it inherits the caller's
authenticated session. Activate it. The path must match `AI_BASE_ABAP` in
`AiChatService.ts` — change both together.

**4. Rotation** is a table update; no transport, no restart, no redeploy.

Two behaviour differences from the approuter path, both expected:

- **No progressive streaming.** `cl_http_client` buffers the whole response, so the answer
  appears at once instead of typing out. The SSE body is relayed unchanged, so the frontend
  needs no branch — only the perceived latency differs.
- **If POSTs come back 403 with a CSRF complaint**, the ICF node is enforcing token
  validation. The app already holds a CSRF token for its OData calls and can send it, but
  the simpler fix is to leave CSRF off for this node — it carries no state and changes
  nothing on the server.

### BTP destinations (retained, not in use)

In the BTP Cockpit under **Connectivity → Destinations**, two destinations:

| Field | `AI_GROQ` | `AI_OPENROUTER` |
| --- | --- | --- |
| URL | `https://api.groq.com/openai/v1` | `https://openrouter.ai/api/v1` |
| Type | HTTP | HTTP |
| Proxy Type | Internet | Internet |
| Authentication | NoAuthentication | NoAuthentication |

On each, an additional property carries the key:

```
URL.headers.Authorization = Bearer <your-key>
```

The **`ZGP9_User`** role collection grants app access. Note the AI routes are guarded only by
`authenticationType: xsuaa` — **there is no per-scope check on them.** To split AI access from app
access you would have to add a `scope` property to those routes in `xs-app.json` and a matching
scope in `xs-security.json`; neither exists today.

The routes match **only** `chat/completions`. Keep it that way: a broader pattern such as
`^/ai/openrouter/(.*)$` would also expose the provider's key-management endpoints.

> **Note:** SAP KBA [3341287](https://userapps.support.sap.com/sap/support/knowledge/en/3341287)
> reports `URL.headers.<name>` being ignored by some *standalone* approuter versions. This
> was verified working on `@sap/approuter` ^15 with the setup above. If a future upgrade
> breaks it, the symptom is a 401 from the provider on **both** routes at once (a single
> route failing is a bad key value instead), and the fix is a small approuter extension
> that injects the header from a CF environment variable.
>
> Do not add comment keys such as `_comment` to `xs-app.json` — the approuter validates it
> against a strict schema and refuses to start on unknown properties.

⚠️ **Two `xs-app.json` files exist and have drifted.** `approuter/xs-app.json` is the one that
actually serves (`mta.yaml` deploys a standalone approuter module). The root `xs-app.json` is
bundled into the app zip by `ui5-task-zipper` and carries a stale `logoutPage`. Decide which is
authoritative before relying on either.

## License

Apache Software License, version 2.0, except as noted otherwise in the [LICENSE](LICENSE) file.
