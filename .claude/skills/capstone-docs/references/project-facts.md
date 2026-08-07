# Project facts — verified against the repository

Every fact below was read out of the code, and each section names the file to re-check it in.
Verify before relying on anything here if the repo has moved on; treat a mismatch as the code
being right and this file being stale.

**Contents**

1. Identity and stack
2. Layer architecture
3. Views, controllers, routes
4. Service layer
5. Backend contract (OData V4)
6. Domain model
7. Permissions
8. Deployment topology
9. AI assistant path
10. Team
11. What is *not* knowable from this repo

---

## 1. Identity and stack

| Item | Value | Source |
| --- | --- | --- |
| App / component id | `com.zgp9.fe` | `webapp/manifest.json` |
| Product name | Metadata Manage Center | `README.md` |
| BSP application | `ZGSU26GP09_FE_1` | `ui5-deploy.yaml` |
| ABAP package | `ZGSU26GP09` | `README.md` |
| Transport | `S40K919517` | `README.md` |
| Frontend stack | SAPUI5 + TypeScript, MVC, XML views | `package.json`, `webapp/` |
| UI5 API surface | **1.108.33 floor** — code must not use post-1.108 APIs | `README.md`, `package.json` |
| Build tooling | UI5 Tooling v4 (`@ui5/cli`), `ui5-tooling-transpile` | `package.json` |
| Backend | ABAP on `s40lp1.ucc.cit.tum.de` client 324, RAP / OData V4 | `README.md`, `manifest.json` |
| Size | ~8,400 lines across `webapp/controller` + `webapp/services` | `wc -l webapp/controller/*.ts webapp/services/*.ts` |

The 1.108 constraint exists because the app runs embedded in the Fiori Launchpad, and the
launchpad bootstraps UI5 once for the whole shell from the ABAP server, which serves 1.108.33.
An app cannot bring its own UI5 into an existing launchpad page. This is worth a paragraph in
any architecture chapter — it is the single most consequential design constraint on the project.

## 2. Layer architecture

Four layers, strictly one-directional:

```
XML Views (12) + Fragments (8)     webapp/view/
        │  data binding + event handlers
Controllers (13)                    webapp/controller/   — extend BaseController
        │  method calls
Services (16)                       webapp/services/     — business logic, no UI
        │  ODataClient
ABAP backend (OData V4)             /sap/opu/odata4/sap/zsb_gsugp9/...
```

Controllers hold no HTTP code and services hold no UI code — `ODataClient` is the single
chokepoint through which every backend call passes, which is why CSRF handling and error
translation live in one place. Say this explicitly in a design chapter; it is the layering
claim a reviewer will spot-check.

`BaseController.ts` is the shared parent — routing helpers, model access, i18n. Any controller
class diagram should show that inheritance rather than 12 unrelated boxes.

## 3. Views, controllers, routes

Routing: `sap.f.routing.Router`, flexible column layout, all targets nested under the `shell`
target (`MainShell`). Source: `webapp/manifest.json` → `sap.ui5.routing`.

| Route name | Pattern | Target view |
| --- | --- | --- |
| `home` | `` (empty) | Home |
| `registryList` | `registries:?query:` | RegistryList |
| `registryDetail` | `registries/{registryId}` | RegistryDetail |
| `versionDetail` | `registries/{registryId}/versions/{versionId}:?query:` | VersionDetail |
| `modelExplorer` | `registries/{registryId}/versions/{versionId}/model:?query:` | ModelExplorer |
| `versionCompare` | `registries/{registryId}/versions/compare/{leftVersionId}/{rightVersionId}` | VersionCompare |
| `detailCompare` | `.../compare/{leftVersionId}/{rightVersionId}/detail/{baseDetailId}/{compareDetailId}` | DetailCompare |
| `jobList` | `jobs` | JobList |
| `jobDetail` | `jobs/{jobId}` | JobList + JobDetail (mid column) |
| `logs` | `logs:?query:` | Logs |

Controllers (13): `App`, `BaseController`, `MainShell`, `Home`, `RegistryList`,
`RegistryDetail`, `VersionDetail`, `VersionCompare`, `DetailCompare`, `ModelExplorer`,
`JobList`, `JobDetail`, `Logs`.

Fragments (8): `AiChatDialog`, `RegistryDialog`, `RegistryListSortDialog`, `JobDetailDialog`,
`LogDetailDialog`, `SendMailDialog`, `SendVersionMailDialog`, `NavToggleButton`.

Side navigation (`webapp/view/MainShell.view.xml`): Home, Registry Management, Scan Job
Management (visible only with `ScanJob.Execute`), Logs.

## 4. Service layer

`webapp/services/` — 16 modules. Classes are stateful services; the rest are pure function
modules, which matters for a class diagram (do not draw a pure module as a class with methods).

**Classes**

| Service | Responsibility | Notable methods |
| --- | --- | --- |
| `ODataClient` | Every HTTP call, CSRF token lifecycle, ETag headers | `readJson`, `readText`, `postJson`, `fetchCsrfToken`, `ensureWriteHeaders` |
| `RegistryService` | Registry CRUD, value helps, permissions | `getRegistries`, `getRegistry`, `createRegistry`, `updateRegistry`, `deleteRegistry`, `activateRegistry`, `deactivateRegistry`, `generateVersion`, `getPermissions` |
| `VersionService` | Versions of a registry, version comparison | `getVersions`, `getVersion`, `compareVersions` |
| `DetailService` | Service-definition details, node trees, node diff, email | `getDetails`, `getDetail`, `getParsedDetail`, `getNodeTree`, `compareNodeTree`, `sendEmail` |
| `JobService` | Scan jobs | `getJobs`, `getJob`, `runScanJob` |
| `LogService` | Audit log, paging and filtering | `getLogs`, `getLogsByJobId`, `getActionTypeOptions` |
| `AuthenticationService` | Session + CSRF | `getSession`, `fetchCsrfToken` |
| `AiChatService` | AI assistant, provider fallback, streaming | `ask`, `askStream`, `getModelOptions`, `buildSystemPrompt` |
| `ErrorHandler` | Turns errors into user-facing messages | `handle` |
| `ServiceError` | Error type carrying HTTP status + details | — |

**Function modules** — `ODataParsers` (entity → domain type mapping), `EdmxModel` (`parseEdmx`),
`XmlNodeUtils` (pretty-print, node tree building, line diff), `ChangeAnalysis`
(`analyzeChanges`), `SessionStorage` (session + theme + nav preferences), `Launchpad`
(FLP integration).

`VersionService` takes `DetailService` in its constructor — the only service-to-service
dependency; everything else depends only on `ODataClient`.

## 5. Backend contract (OData V4)

Base URI: `/sap/opu/odata4/sap/zsb_gsugp9/srvd_a2x/sap/zsr_registry/0001/`
(`manifest.json` → `sap.app.dataSources.mainService`, `odataVersion: 4.0`).

**Entity sets**: `/Registry`, `/Version`, `/Detail`, `/ScanJob`, `/Log`.

**Value helps**: `/ZI_GRP_STAT_VH` (status), `/ZI_GRP_TYPE_VH` (group type),
`/ZI_LOG_ACT_TYPE_VH` (log action type).

**Actions** (all namespaced `com.sap.gateway.srvd_a2x.zsr_registry.v0001.`):

| Action | Bound to | Purpose |
| --- | --- | --- |
| `getPermissions` | `/Registry` | Returns the permission strings the UI gates on |
| `runScan` | `/ScanJob` | Starts a scan job |
| `compareVersion` | `/Version` | Diff of two versions |
| `compareNodeTree` | `/Detail` | Node-level diff of two service definitions |
| `sendEmail` | `/Detail` | Sends metadata by mail, optionally attaching version XML |

Writes go through `ODataClient.ensureWriteHeaders()`, which attaches the CSRF token and, where
the caller supplies one, the ETag for optimistic locking.

## 6. Domain model

From `webapp/model/types.ts` — use these for an ER or class diagram of the data.

```
Registry 1 ──── * RegistryVersion 1 ──── * RegistryDetail
   │                                          
   └── status: Published | Unpublished | Archive

ScanJob (Job)  ──── * LogEntry          (LogEntry.jobId)
LogEntry ──── objectId / objectIdType   (polymorphic link to Registry or Version)
```

| Type | Key fields |
| --- | --- |
| `Registry` | `id`, `registryName`, `serviceName`, `serviceType`, `status`, `statusText`, `description`, `createdBy/At`, `lastChangedBy/At`, `serviceDefinition`, `etag`, `versionNo`, `versions[]` |
| `RegistryVersion` | `id`, `groupId`, `versionNumber`, `createdBy`, `createdAt`, `comment`, `metadata`, `xml` |
| `RegistryDetail` | `id`, `versionId`, `groupId`, `serviceDefinition`, `serviceHash`, `lastChangedAt`, `xml` |
| `Job` | `id`, `status`, `startedAt`, `finishedAt`, `durationMs`, `executedBy`, `triggerType/Text`, `totalRegistry`, `changeCount`, `newVersionCount`, `logs[]`, `errorMessage`, `summary` |
| `LogEntry` | `id`, `actionType`, `actionText`, `actor`, `actionAt`, `ipAddress`, `remarks`, `logResult`, `objectId`, `objectIdType`, `jobId` |
| `MetadataDetails` | `entityTypes`, `entitySets`, `properties`, `navigationProperties`, `functionImports`, `actions`, `complexTypes` |

Status enums: `RegistryStatus` = `Published | Unpublished | Archive`;
`JobStatus` = `Completed | Running | Failed | Queued`;
change types = `CHANGED | ADDED | DELETED | UNCHANGED`.

## 7. Permissions

`MainShell.loadGlobalPermissions()` calls `RegistryService.getPermissions()` once at startup and
writes three flags into the `ui` model: `canCreate` (`Registry.Create`), `canUpdate`
(`Registry.Update`), `canExecuteScanJob` (`ScanJob.Execute`).

Backend source: authorization object `Z_REGISTRY` (class `ZGP9`), whose `ACTVT` and `ZGP9ACTION`
values the backend maps to those strings.

Missing permissions **hide UI rather than erroring** — no Jobs nav entry, no Create button, no
Actions column. Worth stating in a security chapter: the frontend gating is usability, and the
backend authorization object is the actual control.

## 8. Deployment topology

Three ways the app runs, which is the substance of any deployment diagram:

| Host | Entry | UI5 version | Notes |
| --- | --- | --- | --- |
| Fiori Launchpad (`/sap/bc/ui2/flp`) | `Component.js` loaded into the running shell | 1.108.33 | The production path. Uses none of the `index*.html` files |
| ABAP standalone | `/sap/bc/ui5_ui5/sap/zgsu26gp09_fe_1/index.html` | CDN 1.149.1 | Same deployed artifact, different bootstrap |
| Local dev | `npm start` → `index-local.html` | tooling-served 1.108.33 | Backend reached via `ui5-middleware-sap-proxy`; Basic Auth prompt on first load |

Launchpad wiring: semantic object `ZODataServiceRegistry`, action `manage`, catalog
`ZGSU26GP09_FE_CAT`, tile navigating **by intent** (not by URL), PFCG role carrying the catalog.

**BTP is not a deployment target** (owner's decision). `mta.yaml`, `xs-app.json`,
`xs-security.json` and `approuter/` are still in the tree and still build, but nothing verifies
them — do not draw BTP/Cloud Foundry in a deployment diagram unless the user explicitly wants the
retained-but-unused path shown, and label it as such if so.

## 9. AI assistant path

The browser never holds a provider key. `resolveAiBasePath()` in `AiChatService.ts` picks the
base path from the app's own UI5 resource root:

| Host | Base path | Key attached by |
| --- | --- | --- |
| ABAP (standalone + FLP) | `/sap/bc/zgp9_ai/` | `ZCL_GP9_AI_PROXY` via SM59 destination |
| Local `npm start` | `/ai/` | `ui5-middleware-sap-proxy` from `.env` |

Providers: Groq primary, OpenRouter as fallback when Groq is rate-limited. ABAP config table
`ZGP9_AI_CFG` holds the key in plaintext — a known, documented weakness (mitigated by an
`SE54` table authorization group), and honest material for a security section.

## 10. Team

Git contributors: Nguyen Tuan Kiet (also "Kiet Nguyen Tuan"), cuongtq (also "Quoc Cuong Tran"),
ducanh108. Commit counts are not role assignments — ask the user who owns which module before
writing a task-assignment sheet.

## 11. What is *not* knowable from this repo

Ask the user; do not infer:

- **Backend implementation** — CDS views, behavior definitions, ABAP classes, DB tables. Only the
  OData surface in §5 is visible here. A backend class diagram cannot be drawn from this repo.
- **Requirement IDs and numbering** — no requirements document lives here.
- **Sprint dates, milestones, effort estimates, meeting minutes.**
- **Who owns which module**, and the supervisor/reviewer names.
- **Test results** — the repo's baselines (typecheck clean, lint 1 known error, `ui5lint` 2
  deliberate errors, `test-unit` 78/82 with 4 known-stale failures) describe automated checks,
  not a manual test execution log. Only `MainShell.qunit.ts` exists as a unit test.
