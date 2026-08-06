/* eslint-disable @typescript-eslint/no-explicit-any --
 * Route `arguments` are deliberately `Record<string, any>`. Every call site immediately
 * asserts the result to a route-specific shape; `unknown` would make those assertions fail on
 * insufficient overlap, and `string` is wrong because the `'?query'` entry is a nested object.
 * Confining the `any` to this shim keeps it out of the controllers.
 */

/**
 * Type shims for SAPUI5 1.108.33.
 *
 * The Fiori Launchpad on s40lp1 bootstraps UI5 once for the whole shell from the ABAP
 * server's SAP_UI component, so an embedded app runs on 1.108.33 and cannot bring its own
 * version. `@sapui5/ts-types-esm@1.108.33` therefore replaced `@sapui5/types@1.149.1`.
 *
 * Those older typings are missing two things this codebase relies on. Neither is a runtime
 * gap — both APIs exist in 1.108 — so shimming the types is the correct fix rather than
 * rewriting working code.
 *
 * Note on structure: every `import` here sits *inside* a `declare module` block, never at
 * the top level. A top-level import would make this file a module, which turns each
 * `declare module` into an augmentation of an existing module — and an augmentation cannot
 * declare a module that does not exist, which the `sap/ui/test/starter/config` shim below
 * needs to do. Keeping the file ambient lets it both merge with real modules and declare
 * missing ones. The SAP typings themselves use this same per-block import style.
 *
 * Delete this whole file if the project ever moves back to newer typings; everything here
 * is generated properly from 1.115 onwards.
 *
 * See FLP_MIGRATION.md (Phase 2.3, 2.5) for the full reasoning.
 */

/*
 * 1. Generated `Control$EventName` parameter types.
 *
 * These are produced by SAP's type generator from 1.115 onwards; in 1.108 they do not exist
 * at all (`ListBase$ItemPressEvent` appears zero times in the package). Nine controllers
 * import them, so declaring them here keeps those files untouched.
 *
 * Each is declared as an interface extending `Event` with typed `getParameter` overloads,
 * *not* as a bare `type X = Event` alias. The alias version compiles but is actively harmful:
 *   - the codebase's idiom is `(event as Route$PatternMatchedEvent).getParameter(...)`, and
 *     if the alias resolves to `Event` that cast becomes `Event as Event`, which
 *     `@typescript-eslint/no-unnecessary-type-assertion` correctly flags;
 *   - `Event.getParameter()` is typed `=> any` in 1.108, so every downstream value decays to
 *     `any` and the `no-unsafe-*` rules fire in cascade.
 * Aliasing produced 34 ESLint errors against a baseline of 1. The overloads below restore the
 * precision the 1.149 generated types provided.
 *
 * The trailing `getParameter(name: string): unknown` in each block keeps the interface
 * compatible with the inherited signature for any parameter name not enumerated here.
 *
 * Each interface also carries a required `__ui5EventBrand`. Overloads alone are not enough:
 * because the inherited `getParameter` returns `any`, an interface that only adds overloads is
 * *structurally identical* to `Event`, so TypeScript treats the codebase's
 * `(event as Route$PatternMatchedEvent)` casts as no-ops and `no-unnecessary-type-assertion`
 * flags all 14 of them. The brand makes the types nominally distinct, so those casts narrow
 * for real — which is what the 1.149 generated classes did naturally, since they carried
 * genuinely different members.
 *
 * The brand is type-only and never exists at runtime. It is the reason this migration needed
 * no edits to the nine controllers' event handling, which keeps this file's
 * delete-to-revert property intact.
 */

declare module 'sap/m/ListBase' {
	import type Event from 'sap/ui/base/Event';
	import type ListItemBase from 'sap/m/ListItemBase';

	export interface ListBase$ItemPressEvent extends Event {
		readonly __ui5EventBrand: 'ListBase$ItemPressEvent';
		getParameter(name: 'listItem'): ListItemBase;
		getParameter(name: 'srcControl'): ListItemBase;
		getParameter(name: string): unknown;
	}

	export interface ListBase$SelectionChangeEvent extends Event {
		readonly __ui5EventBrand: 'ListBase$SelectionChangeEvent';
		getParameter(name: 'listItem'): ListItemBase;
		getParameter(name: 'listItems'): ListItemBase[];
		getParameter(name: 'selected'): boolean;
		getParameter(name: 'selectAll'): boolean;
		getParameter(name: string): unknown;
	}
}

declare module 'sap/m/ViewSettingsDialog' {
	import type Event from 'sap/ui/base/Event';
	import type ViewSettingsItem from 'sap/m/ViewSettingsItem';

	export interface ViewSettingsDialog$ConfirmEvent extends Event {
		readonly __ui5EventBrand: 'ViewSettingsDialog$ConfirmEvent';
		getParameter(name: 'sortItem'): ViewSettingsItem;
		getParameter(name: 'sortDescending'): boolean;
		getParameter(name: 'groupItem'): ViewSettingsItem;
		getParameter(name: 'groupDescending'): boolean;
		getParameter(name: 'filterItems'): ViewSettingsItem[];
		getParameter(name: 'filterString'): string;
		getParameter(name: string): unknown;
	}
}

declare module 'sap/ui/core/routing/Route' {
	import type Event from 'sap/ui/base/Event';

	export interface Route$PatternMatchedEvent extends Event {
		readonly __ui5EventBrand: 'Route$PatternMatchedEvent';
		getParameter(name: 'name'): string;
		/**
		 * Route parameters. `any` rather than `unknown` because every call site immediately
		 * asserts it to a route-specific shape, and `unknown` would make those assertions
		 * error on insufficient overlap.
		 */
		getParameter(name: 'arguments'): Record<string, any>;
		getParameter(name: string): unknown;
	}
}

declare module 'sap/ui/core/routing/Router' {
	import type Event from 'sap/ui/base/Event';

	export interface Router$RouteMatchedEvent extends Event {
		readonly __ui5EventBrand: 'Router$RouteMatchedEvent';
		getParameter(name: 'name'): string;
		getParameter(name: 'arguments'): Record<string, any>;
		getParameter(name: string): unknown;
	}
}

/*
 * 2. The QUnit test-starter's configuration type.
 *
 * `sap/ui/test/starter/config` ships no declaration in 1.108, but the module is present at
 * runtime and `webapp/test/testsuite.qunit.ts` imports `SuiteConfiguration` from it purely to
 * type its own exported object.
 */

declare module 'sap/ui/test/starter/config' {
	export interface SuiteConfiguration {
		name?: string;
		defaults?: Record<string, unknown>;
		tests?: Record<string, unknown>;
		[key: string]: unknown;
	}
}

/*
 * 3. `Model#addBinding`, absent from the 1.108 typings (zero hits in the package) though the
 * method has existed on `sap.ui.model.Model` for far longer.
 *
 * `MainShell.controller.ts` needs it to observe `/sideNavVisible` without owning a control
 * bound to it. `bindProperty()` alone returns a binding the model never checks: registration
 * is what `addBinding` does, and without it the binding's `change` event never fires. The
 * model-level `propertyChange` event is not an alternative — on 1.108 `JSONModel.setProperty`
 * runs `checkUpdate` over registered bindings but never fires it (verified in the browser).
 */

declare module 'sap/ui/model/Model' {
	import type Binding from 'sap/ui/model/Binding';

	export default interface Model {
		addBinding(binding: Binding): void;
	}
}
