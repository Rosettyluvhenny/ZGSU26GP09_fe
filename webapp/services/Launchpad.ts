/**
 * Fiori Launchpad integration seam.
 *
 * Every `sap.ushell` access in the app goes through this module, deliberately — see
 * FLP_MIGRATION.md 3.1. The embedded/standalone split is hard enough to reason about
 * without `sap.ushell.Container` checks scattered across controllers, and each such site
 * would need its own copy of the typing workaround described below.
 *
 * The app must never *depend* on sap.ushell, and `ui5.yaml` deliberately does not declare it:
 * doing so would pull sap.ui.comp, sap.ui.table, sap.ui.mdc, sap.viz and more in as project
 * dependencies. Embedded, the launchpad shell supplies it; standalone — the ABAP direct URL —
 * it is simply absent. Absence is therefore a supported state, not an error, which is why
 * everything here is optional-chained rather than asserted.
 *
 * On typing: `@sapui5/ts-types-esm@1.108.33` ships `sap.ushell.d.ts`, but it declares the
 * `sap.ushell.services.Container` *class* and never declares the global singleton
 * `sap.ushell.Container` as a value. Declaring only what this app actually reads is both
 * more accurate and far smaller than fighting the generated types, and it keeps
 * ui5-108-types.d.ts free of anything unrelated to the 1.108 downgrade.
 *
 * Nothing here calls into the container — only its *presence* is read. The app deliberately
 * has no launchpad logout: the FLP shell bar owns the session, and the app's own Logout
 * button is hidden when embedded (FLP_MIGRATION.md 3.3). A `logoutFromLaunchpad()` wrapper
 * around `Container.logout()` used to live here and was deleted as unreachable — see 3.4
 * before adding one back.
 */

interface UshellGlobal {
	Container?: object;
}

/**
 * `window.sap.ushell`, or undefined when no shell bootstrapped it.
 *
 * The UI5 typings do not declare `sap` on `Window`, so the cast is unavoidable. Confining
 * it to this one expression is the point of the module.
 */
const getUshell = (): UshellGlobal | undefined => (window as unknown as { sap?: { ushell?: UshellGlobal } }).sap?.ushell;

/**
 * True when the app is running inside a Fiori Launchpad shell.
 *
 * Tests for `sap.ushell.Container` rather than for a hostname or an FLP-shaped hash: the
 * container is what actually differs between the two environments. Note there is no local
 * way to make this return true — the embedded paths are only exercised by deploying and
 * opening the app from a real launchpad tile (FLP_MIGRATION.md 3.0, 7.1).
 */
export const isInLaunchpad = (): boolean => getUshell()?.Container !== undefined;
