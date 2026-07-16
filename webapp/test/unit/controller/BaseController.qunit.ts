/**
 * QUnit tests for BaseController
 * SAP UI5 flat-module form + sinon.sandbox pattern (sinon 1.x/4.x compatible).
 */
import BaseController from "com/zgp9/fe/controller/BaseController";
import History from "sap/ui/core/routing/History";
import type Router from "sap/ui/core/routing/Router";
import type JSONModel from "sap/ui/model/json/JSONModel";

// sinon: typed via webapp/test/sinon-global.d.ts (uses @types/sinon)

class TestController extends BaseController {}

// ─── Shared state ─────────────────────────────────────────────────────────────
let sandbox: any;
let ctrl: TestController;
let windowHistoryGoStub: any;

function buildController() { return new TestController("test"); }

function buildMockRouter(stub?: any): Router {
    return { navTo: stub ?? sinon.stub() } as unknown as Router;
}
function buildMockSessionModel(authenticated: boolean): JSONModel {
    return { getData: sinon.stub().returns({ authenticated }) } as unknown as JSONModel;
}

// ═════════════════════════════════════════════════════════════════════════════
//  formatDateTime
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("BaseController – formatDateTime", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        ctrl = buildController();
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("returns empty string for empty string input", function (assert) {
    assert.strictEqual(ctrl.formatDateTime(""), "");
});
QUnit.test("returns empty string for null (falsy) input", function (assert) {
    assert.strictEqual(ctrl.formatDateTime(null as unknown as string), "");
});
QUnit.test("returns empty string for undefined input", function (assert) {
    assert.strictEqual(ctrl.formatDateTime(undefined as unknown as string), "");
});
QUnit.test("returns a non-empty string for a valid ISO date", function (assert) {
    const result = ctrl.formatDateTime("2024-06-15T08:30:00.000Z");
    assert.ok(result.length > 0, "Result must be non-empty");
    assert.strictEqual(typeof result, "string");
});
QUnit.test("formatted string includes the correct year", function (assert) {
    const result = ctrl.formatDateTime("2024-06-15T08:30:00.000Z");
    assert.ok(result.includes("2024"), `Expected '2024' in '${result}'`);
});
QUnit.test("returns different strings for different dates", function (assert) {
    const r1 = ctrl.formatDateTime("2024-01-01T00:00:00.000Z");
    const r2 = ctrl.formatDateTime("2025-12-31T23:59:00.000Z");
    assert.notEqual(r1, r2, "Different dates must produce different formatted strings");
});

// ═════════════════════════════════════════════════════════════════════════════
//  formatDuration
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("BaseController – formatDuration", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        ctrl = buildController();
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("returns empty string for null", function (assert) {
    assert.strictEqual(ctrl.formatDuration(null), "");
});
QUnit.test("returns empty string for undefined", function (assert) {
    assert.strictEqual(ctrl.formatDuration(undefined as unknown as number), "");
});
QUnit.test("returns '0m 0s' for 0 ms", function (assert) {
    assert.strictEqual(ctrl.formatDuration(0), "0m 0s");
});
QUnit.test("returns '0m 30s' for 30 000 ms", function (assert) {
    assert.strictEqual(ctrl.formatDuration(30_000), "0m 30s");
});
QUnit.test("returns '1m 0s' for exactly 60 000 ms", function (assert) {
    assert.strictEqual(ctrl.formatDuration(60_000), "1m 0s");
});
QUnit.test("returns '1m 30s' for 90 000 ms", function (assert) {
    assert.strictEqual(ctrl.formatDuration(90_000), "1m 30s");
});
QUnit.test("returns '60m 0s' for 3 600 000 ms (1 hour)", function (assert) {
    assert.strictEqual(ctrl.formatDuration(3_600_000), "60m 0s");
});
QUnit.test("rounds 500 ms to 1 second: '0m 1s'", function (assert) {
    assert.strictEqual(ctrl.formatDuration(500), "0m 1s");
});
QUnit.test("clamps negative ms to '0m 0s'", function (assert) {
    assert.strictEqual(ctrl.formatDuration(-5_000), "0m 0s");
});
QUnit.test("returns correct result for large duration (2h 3m 5s)", function (assert) {
    assert.strictEqual(ctrl.formatDuration((2 * 3600 + 3 * 60 + 5) * 1_000), "123m 5s");
});

// ═════════════════════════════════════════════════════════════════════════════
//  formatStatusState
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("BaseController – formatStatusState", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        ctrl = buildController();
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("'Published' → 'Success'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("Published"), "Success");
});
QUnit.test("'Completed' → 'Success'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("Completed"), "Success");
});
QUnit.test("'Unpublished' → 'Warning'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("Unpublished"), "Warning");
});
QUnit.test("'Queued' → 'Warning'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("Queued"), "Warning");
});
QUnit.test("'Archive' → 'Error'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("Archive"), "Error");
});
QUnit.test("'Failed' → 'Error'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("Failed"), "Error");
});
QUnit.test("'Running' → 'Information'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("Running"), "Information");
});
QUnit.test("unknown status → 'None'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("Unknown" as any), "None");
});
QUnit.test("empty string → 'None'", function (assert) {
    assert.strictEqual(ctrl.formatStatusState("" as any), "None");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onNavBack
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("BaseController – onNavBack", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        ctrl = buildController();
        windowHistoryGoStub = sandbox.stub(window.history, "go");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("calls window.history.go(-1) when there is a valid previous hash", function (assert) {
    sandbox.stub(History, "getInstance").returns({ getPreviousHash: sinon.stub().returns("some/route") } as any);
    sandbox.stub(ctrl, "getRouter").returns(buildMockRouter());
    sandbox.stub(ctrl, "getSessionModel").returns(buildMockSessionModel(true));

    ctrl.onNavBack();

    assert.ok(windowHistoryGoStub.calledOnceWith(-1), "window.history.go(-1) must be called");
});

QUnit.test("navigates to 'home' when no previous hash and user is authenticated", function (assert) {
    sandbox.stub(History, "getInstance").returns({ getPreviousHash: sinon.stub().returns(undefined) } as any);
    const navToStub = sinon.stub();
    sandbox.stub(ctrl, "getRouter").returns(buildMockRouter(navToStub));
    sandbox.stub(ctrl, "getSessionModel").returns(buildMockSessionModel(true));

    ctrl.onNavBack();

    assert.strictEqual(navToStub.firstCall.args[0], "home", "Must navigate to 'home'");
    assert.ok(!windowHistoryGoStub.called, "window.history.go must NOT be called");
});

QUnit.test("navigates to 'login' when no previous hash and user is NOT authenticated", function (assert) {
    sandbox.stub(History, "getInstance").returns({ getPreviousHash: sinon.stub().returns(undefined) } as any);
    const navToStub = sinon.stub();
    sandbox.stub(ctrl, "getRouter").returns(buildMockRouter(navToStub));
    sandbox.stub(ctrl, "getSessionModel").returns(buildMockSessionModel(false));

    ctrl.onNavBack();

    assert.strictEqual(navToStub.firstCall.args[0], "login", "Must navigate to 'login'");
});

QUnit.test("navigates to 'login' when previous hash is empty string (login page)", function (assert) {
    sandbox.stub(History, "getInstance").returns({ getPreviousHash: sinon.stub().returns("") } as any);
    const navToStub = sinon.stub();
    sandbox.stub(ctrl, "getRouter").returns(buildMockRouter(navToStub));
    sandbox.stub(ctrl, "getSessionModel").returns(buildMockSessionModel(false));

    ctrl.onNavBack();

    assert.strictEqual(navToStub.firstCall.args[0], "login");
});
