/**
 * QUnit tests for BaseController (formatters + onNavBack).
 */
import BaseController from "com/zgp9/fe/controller/BaseController";
import History from "sap/ui/core/routing/History";
import type Router from "sap/ui/core/routing/Router";

class TestController extends BaseController {}

let sandbox: any;
let ctrl: TestController;
let windowHistoryGoStub: any;

function buildMockRouter(navToStub?: any): Router {
    return { navTo: navToStub ?? sinon.stub() } as unknown as Router;
}

QUnit.module("BaseController – formatDateTime", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        ctrl = new TestController("test");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("returns empty string for falsy input", function (assert) {
    assert.strictEqual(ctrl.formatDateTime(""), "");
    assert.strictEqual(ctrl.formatDateTime(null as unknown as string), "");
    assert.strictEqual(ctrl.formatDateTime(undefined as unknown as string), "");
});

QUnit.test("formats a valid ISO date", function (assert) {
    const result = ctrl.formatDateTime("2024-06-15T08:30:00.000Z");
    assert.ok(result.includes("2024"), `Expected year in '${result}'`);
    assert.notEqual(
        ctrl.formatDateTime("2024-01-01T00:00:00.000Z"),
        ctrl.formatDateTime("2025-12-31T23:59:00.000Z")
    );
});

QUnit.module("BaseController – formatDuration", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        ctrl = new TestController("test");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("maps duration edges and typical values", function (assert) {
    const cases: Array<[number | null | undefined, string]> = [
        [null, ""],
        [undefined, ""],
        [0, "0m 0s"],
        [500, "0m 1s"],
        [-5_000, "0m 0s"],
        [30_000, "0m 30s"],
        [90_000, "1m 30s"],
        [3_600_000, "60m 0s"],
        [(2 * 3600 + 3 * 60 + 5) * 1_000, "123m 5s"]
    ];
    cases.forEach(([input, expected]) => {
        assert.strictEqual(ctrl.formatDuration(input as any), expected, `formatDuration(${String(input)})`);
    });
});

QUnit.module("BaseController – formatStatusState", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        ctrl = new TestController("test");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("maps known statuses and falls back to None", function (assert) {
    const cases: Array<[string, string]> = [
        ["Published", "Success"],
        ["Completed", "Success"],
        ["Unpublished", "Warning"],
        ["Queued", "Warning"],
        ["Archive", "Error"],
        ["Failed", "Error"],
        ["Running", "Information"],
        ["Unknown", "None"],
        ["", "None"]
    ];
    cases.forEach(([status, state]) => {
        assert.strictEqual(ctrl.formatStatusState(status as any), state, status || "(empty)");
    });
});

QUnit.module("BaseController – onNavBack", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        ctrl = new TestController("test");
        windowHistoryGoStub = sandbox.stub(window.history, "go");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("calls window.history.go(-1) when previous hash exists", function (assert) {
    sandbox.stub(History, "getInstance").returns({ getPreviousHash: sinon.stub().returns("some/route") } as any);
    sandbox.stub(ctrl, "getRouter").returns(buildMockRouter());

    ctrl.onNavBack();

    assert.ok(windowHistoryGoStub.calledOnceWith(-1));
});

QUnit.test("navigates to home when there is no previous hash", function (assert) {
    sandbox.stub(History, "getInstance").returns({ getPreviousHash: sinon.stub().returns(undefined) } as any);
    const navToStub = sinon.stub();
    sandbox.stub(ctrl, "getRouter").returns(buildMockRouter(navToStub));

    ctrl.onNavBack();

    assert.strictEqual(navToStub.firstCall.args[0], "home");
    assert.ok(!windowHistoryGoStub.called);
});

QUnit.test("navigates to home when previous hash is empty", function (assert) {
    sandbox.stub(History, "getInstance").returns({ getPreviousHash: sinon.stub().returns("") } as any);
    const navToStub = sinon.stub();
    sandbox.stub(ctrl, "getRouter").returns(buildMockRouter(navToStub));

    ctrl.onNavBack();

    assert.strictEqual(navToStub.firstCall.args[0], "home");
});
