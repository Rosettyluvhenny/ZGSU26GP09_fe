/**
 * QUnit tests for Logs controller
 * SAP UI5 flat-module form + sinon.sandbox pattern (sinon 1.x/4.x compatible).
 */

import Logs from "com/zgp9/fe/controller/Logs.controller";
import type { LogEntry } from "com/zgp9/fe/model/types";

// sinon: typed via webapp/test/sinon-global.d.ts (uses @types/sinon)

let sandbox: any;

// ─────────────────────────────────────────────────────────────────────────────
//  Sample data
// ─────────────────────────────────────────────────────────────────────────────
function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
    const actionType = overrides.actionType ?? "LOGIN";
    return {
        id: "log-1", actionType, actionText: overrides.actionText ?? actionType, actor: "alice",
        actionAt: "2024-06-01T10:00:00.000Z", ipAddress: "10.0.0.1",
        remarks: "", logResult: "SUCCESS", objectId: "reg-1", objectIdType: "REGISTRY",
        jobId: "",
        ...overrides
    };
}

const SAMPLE_LOGS: LogEntry[] = [
    makeLog({ id: "log-1", actionType: "LO", actionText: "Login",  logResult: "SUCCESS", objectIdType: "REGISTRY", actionAt: "2024-06-01T10:00:00.000Z" }),
    makeLog({ id: "log-2", actionType: "UP", actionText: "Update",  logResult: "FAILURE", objectIdType: "VERSION", objectId: "ver-1", actionAt: "2024-06-02T12:00:00.000Z" }),
    makeLog({ id: "log-3", actionType: "DE", actionText: "Delete",  logResult: "SUCCESS", objectIdType: "REGISTRY", objectId: "reg-2", actionAt: "2024-06-03T15:00:00.000Z", actor: "bob" })
];

function pageOf(items: LogEntry[], totalCount = items.length, hasMore = false) {
    return { items, totalCount, hasMore };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fixture builder
// ─────────────────────────────────────────────────────────────────────────────
interface LogsFixture {
    ctrl: Logs;
    modelData: Record<string, any>;
    modelStub: any;
    logService: any;
    navToStub: any;
}

function buildLogsFixture(): LogsFixture {
    const ctrl = new Logs("test");

    const modelData: Record<string, any> = {
        "/items": [], "/busy": false, "/search": "",
        "/actionType": "All", "/logResult": "All", "/objectIdType": "All",
        "/actionTypeOptions": [], "/logResultOptions": [], "/objectIdTypeOptions": [],
        "/selectedLog": null
    };
    const modelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { modelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => modelData[p])
    };

    const logService = { getLogs: sinon.stub().resolves(pageOf(SAMPLE_LOGS)) };
    const navToStub = sinon.stub();

    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "logList" ? (modelStub as any) : (null as any)
    );
    sandbox.stub(ctrl, "getRouter").returns({
        navTo: navToStub,
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
    } as any);
    sandbox.stub(ctrl, "navTo").callsFake(navToStub);
    sandbox.stub(ctrl, "handleServiceError").resolves();
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getLogService: () => logService
    } as any);

    return { ctrl, modelData, modelStub, logService, navToStub };
}

// ═════════════════════════════════════════════════════════════════════════════
//  onInit
// ═════════════════════════════════════════════════════════════════════════════
let onInitCtrl: Logs;
let onInitSetModelSpy: any;

QUnit.module("Logs – onInit", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        onInitCtrl = new Logs("test");
        onInitSetModelSpy = sandbox.stub(onInitCtrl, "setModel").returns(onInitCtrl);
        sandbox.stub(onInitCtrl, "getRouter").returns({
            getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
        } as any);
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("registers model under the name 'logList'", function (assert) {
    onInitCtrl.onInit();
    assert.ok(onInitSetModelSpy.calledOnce);
    assert.strictEqual(onInitSetModelSpy.firstCall.args[1], "logList");
});
QUnit.test("initial model has items=[], busy=false, search=''", function (assert) {
    onInitCtrl.onInit();
    const data = onInitSetModelSpy.firstCall.args[0].getData();
    assert.deepEqual(data.items, []);
    assert.strictEqual(data.busy, false);
    assert.strictEqual(data.search, "");
});
QUnit.test("initial filter states are all 'All'", function (assert) {
    onInitCtrl.onInit();
    const data = onInitSetModelSpy.firstCall.args[0].getData();
    assert.strictEqual(data.actionType, "All");
    assert.strictEqual(data.logResult, "All");
    assert.strictEqual(data.objectIdType, "All");
});
QUnit.test("initial filter options only contain All (no invented codes)", function (assert) {
    onInitCtrl.onInit();
    const data = onInitSetModelSpy.firstCall.args[0].getData();
    assert.deepEqual(data.actionTypeOptions, [{ key: "All", text: "All" }]);
    assert.deepEqual(data.logResultOptions, [{ key: "All", text: "All" }]);
    assert.deepEqual(data.objectIdTypeOptions, [{ key: "All", text: "All" }]);
});

// ═════════════════════════════════════════════════════════════════════════════
//  onRefresh
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Logs – onRefresh", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("triggers getLogs on the log service", async function (assert) {
    const { ctrl, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    assert.ok(logService.getLogs.calledOnce, "getLogs must be called on refresh");
});
QUnit.test("sets /busy=false after completion", async function (assert) {
    const { ctrl, modelData } = buildLogsFixture();
    await ctrl.onRefresh();
    assert.strictEqual(modelData["/busy"], false);
});

// ═════════════════════════════════════════════════════════════════════════════
//  onSearchLiveChange
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Logs – onSearchLiveChange", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("updates /search in the model", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    logService.getLogs.resetHistory();
    const event = { getSource: sinon.stub().returns({ getValue: sinon.stub().returns("alice") }) } as any;
    ctrl.onSearchLiveChange(event);
    assert.strictEqual(modelData["/search"], "alice");
    assert.ok(logService.getLogs.notCalled, "liveChange must not trigger server load");
});
QUnit.test("search (Enter) reloads from server with query", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.actor === "bob")));
    const event = { getSource: sinon.stub().returns({ getValue: sinon.stub().returns("bob") }) } as any;
    await ctrl.onSearch(event);
    assert.strictEqual(modelData["/search"], "bob");
    assert.ok(logService.getLogs.called, "onSearch must call getLogs");
    const items = modelData["/items"] as LogEntry[];
    assert.ok(items.every(l => l.actor === "bob"), "Filtered items must match search");
});
QUnit.test("clearing search via onSearch restores all items", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.actor === "bob")));
    await ctrl.onSearch({ getSource: sinon.stub().returns({ getValue: sinon.stub().returns("bob") }) } as any);
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS));
    await ctrl.onSearch({ getSource: sinon.stub().returns({ getValue: sinon.stub().returns("") }) } as any);
    assert.strictEqual((modelData["/items"] as LogEntry[]).length, SAMPLE_LOGS.length, "Clearing search must restore all items");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onFilterChange
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Logs – onFilterChange", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("filters by actionType correctly", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    modelData["/actionType"] = "UP";
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.actionType === "UP")));
    await ctrl.onGo();
    const items = modelData["/items"] as LogEntry[];
    assert.ok(items.every(l => l.actionType === "UP"), "All items must have actionType=UP");
});
QUnit.test("filters by logResult correctly", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    modelData["/logResult"] = "FAILURE";
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.logResult === "FAILURE")));
    await ctrl.onGo();
    const items = modelData["/items"] as LogEntry[];
    assert.ok(items.every(l => l.logResult === "FAILURE"), "All items must have logResult=FAILURE");
});
QUnit.test("filters by objectIdType correctly", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    modelData["/objectIdType"] = "VERSION";
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.objectIdType === "VERSION")));
    await ctrl.onGo();
    const items = modelData["/items"] as LogEntry[];
    assert.ok(items.every(l => l.objectIdType === "VERSION"), "All items must have objectIdType=VERSION");
});
QUnit.test("'All' filter shows all items", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    modelData["/actionType"] = "DE";
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.actionType === "DE")));
    await ctrl.onGo();
    modelData["/actionType"] = "All";
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS));
    await ctrl.onGo();
    assert.strictEqual((modelData["/items"] as LogEntry[]).length, SAMPLE_LOGS.length, "All items must show when filter is 'All'");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onDateRangeChange
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Logs – onDateRangeChange", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("filters out logs before the dateFrom boundary", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    const from = new Date("2024-06-02T00:00:00.000Z");
    const event = {
        getSource: sinon.stub().returns({
            getDateValue: sinon.stub().returns(from),
            getSecondDateValue: sinon.stub().returns(null)
        })
    } as any;
    ctrl.onDateRangeChange(event);
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => new Date(l.actionAt) >= from)));
    await ctrl.onGo();
    const items = modelData["/items"] as LogEntry[];
    assert.ok(!items.find(l => l.id === "log-1"), "log-1 (2024-06-01) must be excluded");
});
QUnit.test("filters out logs after the dateTo boundary", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    const to = new Date("2024-06-01T00:00:00.000Z");
    const event = {
        getSource: sinon.stub().returns({
            getDateValue: sinon.stub().returns(null),
            getSecondDateValue: sinon.stub().returns(to)
        })
    } as any;
    ctrl.onDateRangeChange(event);
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => new Date(l.actionAt) <= new Date("2024-06-01T23:59:59.999Z"))));
    await ctrl.onGo();
    const items = modelData["/items"] as LogEntry[];
    assert.ok(items.every(l => new Date(l.actionAt) <= new Date("2024-06-01T23:59:59.999Z")),
        "Items after dateTo must be excluded");
});
QUnit.test("no date filter when both dateFrom and dateTo are null", async function (assert) {
    const { ctrl, modelData } = buildLogsFixture();
    await ctrl.onRefresh();
    const event = {
        getSource: sinon.stub().returns({
            getDateValue: sinon.stub().returns(null),
            getSecondDateValue: sinon.stub().returns(null)
        })
    } as any;
    ctrl.onDateRangeChange(event);
    await ctrl.onGo();
    assert.strictEqual((modelData["/items"] as LogEntry[]).length, SAMPLE_LOGS.length);
});

// ═════════════════════════════════════════════════════════════════════════════
//  onRowPress
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Logs – onRowPress", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("sets /selectedLog and attempts to open the dialog when a log is present", function (assert) {
    const { ctrl, modelData } = buildLogsFixture();
    const log = makeLog();
    sandbox.stub(ctrl, "getView").returns({ getId: sinon.stub().returns("view--"), addDependent: sinon.stub() } as any);
    const event = {
        getSource: sinon.stub().returns({
            getBindingContext: sinon.stub().returns({ getObject: sinon.stub().returns(log) })
        })
    } as any;
    ctrl.onRowPress(event);
    assert.deepEqual(modelData["/selectedLog"], log, "/selectedLog must be set to the pressed log");
});
QUnit.test("does nothing when binding context is null", function (assert) {
    const { ctrl, modelData } = buildLogsFixture();
    const event = {
        getSource: sinon.stub().returns({ getBindingContext: sinon.stub().returns(null) })
    } as any;
    ctrl.onRowPress(event);
    assert.strictEqual(modelData["/selectedLog"], null, "/selectedLog must remain null");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onNavigateToObject
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Logs – onNavigateToObject", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("navigates to registryDetail for objectIdType=REGISTRY", function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    modelData["/selectedLog"] = makeLog({ objectIdType: "REGISTRY", objectId: "reg-42", logResult: "SUCCESS" });
    void ctrl.onNavigateToObject();
    assert.ok(navToStub.calledOnce, "navTo must be called");
    assert.strictEqual(navToStub.firstCall.args[0], "registryDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { registryId: "reg-42" });
});
QUnit.test("navigates to versionDetail for objectIdType=VERSION", async function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    const getVersion = sinon.stub().resolves({ id: "ver-1", groupId: "reg-9" });
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getVersionService: () => ({ getVersion }),
        getRouter: () => ({ navTo: navToStub })
    } as any);
    modelData["/selectedLog"] = makeLog({ objectIdType: "VERSION", objectId: "ver-1", logResult: "SUCCESS" });
    await ctrl.onNavigateToObject();
    assert.ok(getVersion.calledOnceWithExactly("ver-1"), "must resolve version for registry id");
    assert.ok(navToStub.calledOnce, "navTo must be called");
    assert.strictEqual(navToStub.firstCall.args[0], "versionDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { registryId: "reg-9", versionId: "ver-1" });
});
QUnit.test("navigates to versionDetail for objectIdType=DETAIL", async function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    const getDetail = sinon.stub().resolves({ id: "det-1", groupId: "reg-3", versionId: "ver-8" });
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getDetailService: () => ({ getDetail }),
        getRouter: () => ({ navTo: navToStub })
    } as any);
    modelData["/selectedLog"] = makeLog({ objectIdType: "DETAIL", objectId: "det-1", logResult: "SUCCESS" });
    await ctrl.onNavigateToObject();
    assert.ok(getDetail.calledOnceWithExactly("det-1"), "must resolve detail for version/registry");
    assert.ok(navToStub.calledOnce, "navTo must be called");
    assert.strictEqual(navToStub.firstCall.args[0], "versionDetail");
    assert.deepEqual(navToStub.firstCall.args[1], {
        registryId: "reg-3",
        versionId: "ver-8",
        query: { detailId: "det-1" }
    });
});
QUnit.test("does NOT navigate when result is not SUCCESS", function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    modelData["/selectedLog"] = makeLog({ objectIdType: "REGISTRY", objectId: "reg-42", logResult: "FAIL" });
    void ctrl.onNavigateToObject();
    assert.ok(!navToStub.called, "navTo must NOT be called for non-success results");
});
QUnit.test("does NOT navigate when selectedLog is null", function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    modelData["/selectedLog"] = null;
    void ctrl.onNavigateToObject();
    assert.ok(!navToStub.called, "navTo must NOT be called when selectedLog is null");
});
QUnit.test("does NOT navigate when objectId is empty", function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    modelData["/selectedLog"] = makeLog({ objectId: "", logResult: "SUCCESS" });
    void ctrl.onNavigateToObject();
    assert.ok(!navToStub.called, "navTo must NOT be called when objectId is empty");
});
QUnit.test("does NOT navigate for unknown objectIdType", function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    modelData["/selectedLog"] = makeLog({ objectIdType: "JOB", objectId: "job-1", logResult: "SUCCESS" });
    void ctrl.onNavigateToObject();
    assert.ok(!navToStub.called, "navTo must NOT be called for non-REGISTRY/VERSION/DETAIL types");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onCloseDetailDialog
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Logs – onCloseDetailDialog", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("calls dialog.close when dialog exists", function (assert) {
    const { ctrl } = buildLogsFixture();
    const closeStub = sinon.stub();
    (ctrl as any).detailDialog = { close: closeStub };
    ctrl.onCloseDetailDialog();
    assert.ok(closeStub.calledOnce, "dialog.close must be called");
});
QUnit.test("does NOT throw when no dialog exists", function (assert) {
    const { ctrl } = buildLogsFixture();
    (ctrl as any).detailDialog = undefined;
    let threw = false;
    try { ctrl.onCloseDetailDialog(); } catch { threw = true; }
    assert.ok(!threw, "Must not throw when detailDialog is undefined");
});

// ═════════════════════════════════════════════════════════════════════════════
//  formatLogResultState  (pure function)
// ═════════════════════════════════════════════════════════════════════════════
let fmtCtrl: Logs;

QUnit.module("Logs – formatLogResultState", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        const { ctrl } = buildLogsFixture();
        fmtCtrl = ctrl;
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("'SUCCESS' → 'Success'", function (assert) {
    assert.strictEqual(fmtCtrl.formatLogResultState("SUCCESS"), "Success");
});
QUnit.test("'success' (lowercase) → 'Success'", function (assert) {
    assert.strictEqual(fmtCtrl.formatLogResultState("success"), "Success");
});
QUnit.test("'FAILURE' → 'Error'", function (assert) {
    assert.strictEqual(fmtCtrl.formatLogResultState("FAILURE"), "Error");
});
QUnit.test("'ERROR' → 'Error'", function (assert) {
    assert.strictEqual(fmtCtrl.formatLogResultState("ERROR"), "Error");
});
QUnit.test("'failure' (lowercase) → 'Error'", function (assert) {
    assert.strictEqual(fmtCtrl.formatLogResultState("failure"), "Error");
});
QUnit.test("empty string → 'None'", function (assert) {
    assert.strictEqual(fmtCtrl.formatLogResultState(""), "None");
});
QUnit.test("unknown value 'PENDING' → 'None'", function (assert) {
    assert.strictEqual(fmtCtrl.formatLogResultState("PENDING"), "None");
});
QUnit.test("null (coerced) → 'None'", function (assert) {
    assert.strictEqual(fmtCtrl.formatLogResultState(null as unknown as string), "None");
});

// ═════════════════════════════════════════════════════════════════════════════
//  Filter option building
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Logs – filter option building", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("builds filter options from loaded log values only", async function (assert) {
    const { ctrl, modelData } = buildLogsFixture();
    await ctrl.onRefresh();
    const actionOptions = modelData["/actionTypeOptions"] as Array<{ key: string; text: string }>;
    const resultOptions = modelData["/logResultOptions"] as Array<{ key: string; text: string }>;
    const objectOptions = modelData["/objectIdTypeOptions"] as Array<{ key: string; text: string }>;
    assert.strictEqual(actionOptions[0]?.key, "All");
    assert.ok(actionOptions.some(o => o.key === "LO" && o.text === "Login"), "Action filter shows ActionText, keys ActionType");
    assert.ok(actionOptions.some(o => o.key === "UP" && o.text === "Update"), "Update from ActionText must appear");
    assert.ok(!actionOptions.some(o => o.key === "VI"), "invented VI must not appear");
    assert.ok(resultOptions.some(o => o.key === "SUCCESS"));
    assert.ok(objectOptions.some(o => o.key === "REGISTRY"));
});
QUnit.test("formatShortId truncates long GUIDs", function (assert) {
    const { ctrl } = buildLogsFixture();
    assert.strictEqual(ctrl.formatShortId("8b95f36a-4f27-1fe1-a188-c0e8262dd8a5"), "8b95f36a…d8a5");
    assert.strictEqual(ctrl.formatShortId("short"), "short");
    assert.strictEqual(ctrl.formatShortId(""), "—");
});
QUnit.test("logResult FAIL maps to Error state", function (assert) {
    const { ctrl } = buildLogsFixture();
    assert.strictEqual(ctrl.formatLogResultState("FAIL"), "Error");
    assert.strictEqual(ctrl.formatLogResultState("SUCCESS"), "Success");
});
