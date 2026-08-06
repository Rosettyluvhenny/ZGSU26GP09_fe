/**
 * Ambient declaration for the SAP UI5 bundled sinon library.
 *
 * At runtime sinon is loaded by the QUnit test runner via
 * `sap/ui/thirdparty/sinon-4`.  The types come from the installed
 * `@types/sinon` package so that IDE autocompletion and type-safety work
 * without importing sinon as an ES module.
 */

declare global {
    // `var` is required syntax for ambient global declarations in TypeScript.
    var sinon: typeof import("sinon");
}

export {};
