/**
 * QUnit tests for Logs controller
 */
import Logs from "com/zgp9/fe/controller/Logs.controller";
import type { LogEntry } from "com/zgp9/fe/model/types";

let sandbox: any;

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
    makeLog({ id: "log-1", actionType: "LO", actionText: "Login", logResult: "SUCCESS", objectIdType: "REGISTRY", actionAt: "2024-06-01T10:00:00.000Z" }),
    makeLog({ id: "log-2", actionType: "UP", actionText: "Update", logResult: "FAILURE", objectIdType: "VERSION", objectId: "ver-1", actionAt: "2024-06-02T12:00:00.000Z" }),
    makeLog({ id: "log-3", actionType: "DE", actionText: "Delete", logResult: "SUCCESS", objectIdType: "REGISTRY", objectId: "reg-2", actionAt: "2024-06-03T15:00:00.000Z", actor: "bob" })
];

function pageOf(items: LogEntry[], totalCount = items.length, hasMore = false) {
    return { items, totalCount, hasMore };
}

interface LogsFixture {
    ctrl: Logs;
    modelData: Record<string, any>;
    logService: any;
    navToStub: any;
    ownerComponent: any;
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
    const ownerComponent = {
        getLogService: () => logService,
        getVersionService: () => ({ getVersion: sinon.stub() }),
        getDetailService: () => ({ getDetail: sinon.stub() })
    };

    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "logList" ? (modelStub as any) : (null as any)
    );
    sandbox.stub(ctrl, "getRouter").returns({
        navTo: navToStub,
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
    } as any);
    sandbox.stub(ctrl, "navTo").callsFake(navToStub);
    sandbox.stub(ctrl, "handleServiceError").resolves();
    sandbox.stub(ctrl, "getOwnerComponent").returns(ownerComponent as any);

    return { ctrl, modelData, logService, navToStub, ownerComponent };
}

QUnit.module("Logs – onInit", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("registers logList model with All filters only", function (assert) {
    const ctrl = new Logs("test");
    const setModelSpy = sandbox.stub(ctrl, "setModel").returns(ctrl);
    sandbox.stub(ctrl, "getRouter").returns({
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
    } as any);
    ctrl.onInit();
    assert.strictEqual(setModelSpy.firstCall.args[1], "logList");
    const data = setModelSpy.firstCall.args[0].getData();
    assert.deepEqual(data.items, []);
    assert.strictEqual(data.busy, false);
    assert.strictEqual(data.actionType, "All");
    assert.deepEqual(data.actionTypeOptions, [{ key: "All", text: "All" }]);
});

QUnit.module("Logs – search and filters", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("liveChange updates search without server call; Enter reloads", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    logService.getLogs.resetHistory();

    ctrl.onSearchLiveChange({ getSource: sinon.stub().returns({ getValue: sinon.stub().returns("alice") }) } as any);
    assert.strictEqual(modelData["/search"], "alice");
    assert.ok(logService.getLogs.notCalled);

    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.actor === "bob")));
    await ctrl.onSearch({ getSource: sinon.stub().returns({ getValue: sinon.stub().returns("bob") }) } as any);
    assert.ok(logService.getLogs.called);
    assert.ok((modelData["/items"] as LogEntry[]).every(l => l.actor === "bob"));
});

QUnit.test("applies action/result/object filters via onGo", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();

    modelData["/actionType"] = "UP";
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.actionType === "UP")));
    await ctrl.onGo();
    assert.ok((modelData["/items"] as LogEntry[]).every(l => l.actionType === "UP"));

    modelData["/actionType"] = "All";
    modelData["/logResult"] = "FAILURE";
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.logResult === "FAILURE")));
    await ctrl.onGo();
    assert.ok((modelData["/items"] as LogEntry[]).every(l => l.logResult === "FAILURE"));

    modelData["/logResult"] = "All";
    modelData["/objectIdType"] = "VERSION";
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => l.objectIdType === "VERSION")));
    await ctrl.onGo();
    assert.ok((modelData["/items"] as LogEntry[]).every(l => l.objectIdType === "VERSION"));
});

QUnit.test("date range excludes logs outside bounds", async function (assert) {
    const { ctrl, modelData, logService } = buildLogsFixture();
    await ctrl.onRefresh();
    const from = new Date("2024-06-02T00:00:00.000Z");
    ctrl.onDateRangeChange({
        getSource: sinon.stub().returns({
            getDateValue: sinon.stub().returns(from),
            getSecondDateValue: sinon.stub().returns(null)
        })
    } as any);
    logService.getLogs.resolves(pageOf(SAMPLE_LOGS.filter(l => new Date(l.actionAt) >= from)));
    await ctrl.onGo();
    assert.ok(!(modelData["/items"] as LogEntry[]).find(l => l.id === "log-1"));
});

QUnit.module("Logs – onRowPress", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("selects log from row or ignores null context", function (assert) {
    const { ctrl, modelData } = buildLogsFixture();
    const log = makeLog();
    sandbox.stub(ctrl, "getView").returns({ getId: sinon.stub().returns("view--"), addDependent: sinon.stub() } as any);
    ctrl.onRowPress({
        getSource: sinon.stub().returns({
            getBindingContext: sinon.stub().returns({ getObject: sinon.stub().returns(log) })
        })
    } as any);
    assert.deepEqual(modelData["/selectedLog"], log);

    modelData["/selectedLog"] = null;
    ctrl.onRowPress({
        getSource: sinon.stub().returns({ getBindingContext: sinon.stub().returns(null) })
    } as any);
    assert.strictEqual(modelData["/selectedLog"], null);
});

QUnit.module("Logs – onNavigateToObject", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("navigates for REGISTRY / VERSION / DETAIL success logs", async function (assert) {
    const { ctrl, modelData, navToStub, ownerComponent } = buildLogsFixture();

    modelData["/selectedLog"] = makeLog({ objectIdType: "REGISTRY", objectId: "reg-42", logResult: "SUCCESS" });
    await ctrl.onNavigateToObject();
    assert.strictEqual(navToStub.firstCall.args[0], "registryDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { registryId: "reg-42" });

    navToStub.resetHistory();
    const getVersion = sinon.stub().resolves({ id: "ver-1", groupId: "reg-9" });
    ownerComponent.getVersionService = () => ({ getVersion });
    modelData["/selectedLog"] = makeLog({ objectIdType: "VERSION", objectId: "ver-1", logResult: "SUCCESS" });
    await ctrl.onNavigateToObject();
    assert.ok(getVersion.calledOnceWithExactly("ver-1"));
    assert.strictEqual(navToStub.firstCall.args[0], "versionDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { registryId: "reg-9", versionId: "ver-1" });

    navToStub.resetHistory();
    const getDetail = sinon.stub().resolves({ id: "det-1", groupId: "reg-3", versionId: "ver-8" });
    ownerComponent.getDetailService = () => ({ getDetail });
    modelData["/selectedLog"] = makeLog({ objectIdType: "DETAIL", objectId: "det-1", logResult: "SUCCESS" });
    await ctrl.onNavigateToObject();
    assert.ok(getDetail.calledOnceWithExactly("det-1"));
    assert.deepEqual(navToStub.firstCall.args[1], {
        registryId: "reg-3",
        versionId: "ver-8",
        query: { detailId: "det-1" }
    });
});

QUnit.test("navigates for FAIL logs when object target is known", async function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    modelData["/selectedLog"] = makeLog({ objectIdType: "REGISTRY", objectId: "reg-42", logResult: "FAIL" });
    await ctrl.onNavigateToObject();
    assert.strictEqual(navToStub.firstCall.args[0], "registryDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { registryId: "reg-42" });
});

QUnit.test("does not navigate for empty / unknown targets", function (assert) {
    const { ctrl, modelData, navToStub } = buildLogsFixture();
    const blocked = [
        null,
        makeLog({ objectId: "", logResult: "SUCCESS" }),
        makeLog({ objectIdType: "JOB", objectId: "job-1", logResult: "SUCCESS" })
    ];
    blocked.forEach((selected) => {
        modelData["/selectedLog"] = selected;
        void ctrl.onNavigateToObject();
    });
    assert.ok(!navToStub.called);
});

QUnit.module("Logs – helpers", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("formatLogResultState, formatLogActionState and formatShortId", function (assert) {
    const { ctrl } = buildLogsFixture();
    const states: Array<[string, string]> = [
        ["SUCCESS", "Success"],
        ["success", "Success"],
        ["FAILURE", "Error"],
        ["FAIL", "Error"],
        ["ERROR", "Error"],
        ["", "None"],
        ["PENDING", "None"]
    ];
    states.forEach(([input, expected]) => {
        assert.strictEqual(ctrl.formatLogResultState(input), expected, input || "(empty)");
    });
    assert.strictEqual(ctrl.formatLogActionState("CREATE"), "Success");
    assert.strictEqual(ctrl.formatLogActionState("UPDATE"), "Warning");
    assert.strictEqual(ctrl.formatLogActionState("DELETE"), "None");
    assert.strictEqual(ctrl.formatShortId("8b95f36a-4f27-1fe1-a188-c0e8262dd8a5"), "8b95f36a…d8a5");
    assert.strictEqual(ctrl.formatShortId("short"), "short");
});

QUnit.test("builds filter options from loaded log values only", async function (assert) {
    const { ctrl, modelData } = buildLogsFixture();
    await ctrl.onRefresh();
    const actionOptions = modelData["/actionTypeOptions"] as Array<{ key: string; text: string }>;
    assert.strictEqual(actionOptions[0]?.key, "All");
    assert.ok(actionOptions.some(o => o.key === "LO" && o.text === "Login"));
    assert.ok(!actionOptions.some(o => o.key === "VI"));
});

QUnit.test("closes detail dialog when present", function (assert) {
    const { ctrl } = buildLogsFixture();
    const closeStub = sinon.stub();
    (ctrl as any).detailDialog = { close: closeStub };
    ctrl.onCloseDetailDialog();
    assert.ok(closeStub.calledOnce);

    (ctrl as any).detailDialog = undefined;
    let threw = false;
    try { ctrl.onCloseDetailDialog(); } catch { threw = true; }
    assert.ok(!threw);
});
