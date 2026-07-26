/**
 * Fiori Launchpad integration seam.
 *
 * Every `sap.ushell` access in the app goes through this module, deliberately — see
 * FLP_MIGRATION.md 3.1. The embedded/standalone split is hard enough to reason about
 * without `sap.ushell.Container` checks scattered across controllers, and each such site
 * would need its own copy of the typing workaround described below.
 *
 * The app must never *depend* on sap.ushell. Embedded, the launchpad shell supplies it and
 * the app must not declare it (see the comment in ui5-flp.yaml); standalone — BTP and the
 * ABAP direct URL — it is simply absent. Absence is therefore a supported state, not an
 * error, which is why everything here is optional-chained rather than asserted.
 *
 * On typing: `@sapui5/ts-types-esm@1.108.33` ships `sap.ushell.d.ts`, but it declares the
 * `sap.ushell.services.Container` *class* and never declares the global singleton
 * `sap.ushell.Container` as a value — and that class's own member is generated as
 * `logout: undefined`, so it is unusable even once reached. Declaring the one member this
 * app actually calls is both more accurate and far smaller than fighting the generated
 * types, and it keeps ui5-108-types.d.ts free of anything unrelated to the 1.108 downgrade.
 */

interface UshellContainer {
	/** Ends the launchpad session, running the shell's registered logout handlers first. */
	logout: () => void;
}

interface UshellGlobal {
	Container?: UshellContainer;
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
 * container is what actually differs between the two environments, and it is present in
 * both the real launchpad and the local sandbox (webapp/test/flpSandbox.html), so the
 * embedded paths are reachable without an ABAP deploy.
 */
export const isInLaunchpad = (): boolean => getUshell()?.Container !== undefined;

/**
 * Ends the session through the launchpad shell.
 *
 * No-ops when not embedded — callers branch on {@link isInLaunchpad} first, and this guard
 * only keeps a missing container from throwing. The shell handles the redirect itself, so
 * unlike the standalone path there is no location assignment here.
 */
export const logoutFromLaunchpad = (): void => {
	getUshell()?.Container?.logout();
};
