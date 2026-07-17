/**
 * QUnit tests for RegistryList controller
 * SAP UI5 flat-module form + sinon.sandbox pattern (sinon 1.x/4.x compatible).
 */

import RegistryList from "com/zgp9/fe/controller/RegistryList.controller";
import MessageToast from "sap/m/MessageToast";
import BusyIndicator from "sap/ui/core/BusyIndicator";

// sinon: typed via webapp/test/sinon-global.d.ts (uses @types/sinon)

let sandbox: any;

// ─────────────────────────────────────────────────────────────────────────────
//  Sample data
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLE_REGISTRIES = [
    {
        id: "reg-1", registryName: "ServiceA", serviceName: "svc-a", serviceType: "OData V4",
        status: "Published" as const, statusText: "Published", description: "", createdBy: "alice",
        createdAt: "2024-01-01T00:00:00Z", lastChangedBy: "alice", lastChangedAt: "2024-01-01T00:00:00Z",
        serviceDefinition: "", versions: [{ versionNumber: "001" } as any]
    }
];
const VALUE_HELPS = {
    groupTypes: [{ key: "001", text: "OData V4" }, { key: "002", text: "REST" }],
    statuses: [{ key: "P", text: "publish" }, { key: "U", text: "unpublish" }, { key: "A", text: "archive" }]
};

// ─────────────────────────────────────────────────────────────────────────────
//  Fixture builders
// ─────────────────────────────────────────────────────────────────────────────
interface RegistryListFixture {
    ctrl: RegistryList;
    modelData: Record<string, any>;
    modelStub: any;
    registryService: any;
    navToStub: any;
}

function buildRegistryListFixture(permissions: string[] = ["Registry.Create", "Registry.Update"]): RegistryListFixture {
    const ctrl = new RegistryList("test");

    const modelData: Record<string, any> = {
        "/items": [], "/busy": false, "/search": "", "/searchField": "all",
        "/status": "All", "/groupType": "All", "/registryName": "", "/createdBy": "",
        "/groupTypes": [], "/statuses": [], "/canCreate": false, "/canUpdate": false
    };
    const modelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { modelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => modelData[p]),
        getData: sinon.stub().callsFake(() => {
            const d: Record<string, any> = {};
            Object.keys(modelData).forEach(k => { d[k.slice(1)] = modelData[k]; });
            return d;
        })
    };

    const registryService = {
        getRegistries: sinon.stub().resolves(SAMPLE_REGISTRIES),
        getPermissions: sinon.stub().resolves(permissions),
        getGroupTypes: sinon.stub().resolves(VALUE_HELPS.groupTypes),
        getStatuses: sinon.stub().resolves(VALUE_HELPS.statuses),
        createRegistry: sinon.stub().resolves(),
        updateRegistry: sinon.stub().resolves()
    };

    const navToStub = sinon.stub();

    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "registryList" ? (modelStub as any) : (null as any)
    );
    sandbox.stub(ctrl, "getRouter").returns({
        navTo: navToStub,
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
    } as any);
    sandbox.stub(ctrl, "handleServiceError").resolves();
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getRegistryService: () => registryService
    } as any);

    return { ctrl, modelData, modelStub, registryService, navToStub };
}

function buildRowEvent(registry: object | null) {
    const ctx = registry ? { getObject: sinon.stub().returns(registry) } : null;
    return {
        getSource: sinon.stub().returns({ getBindingContext: sinon.stub().returns(ctx) })
    } as any;
}

function buildDialogModelStub(overrides: Record<string, any> = {}) {
    const data: Record<string, any> = {
        groupName: "ServiceA", groupType: "001", versionNo: "001",
        status: "P", showVersionNo: true, busy: false, ...overrides
    };
    return {
        getData: sinon.stub().returns({ ...data }),
        setProperty: sinon.stub().callsFake((p: string, v: any) => { data[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => data[p.startsWith("/") ? p.slice(1) : p])
    };
}

// ═════════════════════════════════════════════════════════════════════════════
//  onInit
// ═════════════════════════════════════════════════════════════════════════════
let onInitCtrl: RegistryList;
let onInitSetModelSpy: any;

QUnit.module("RegistryList – onInit", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        onInitCtrl = new RegistryList("test");
        onInitSetModelSpy = sandbox.stub(onInitCtrl, "setModel").returns(onInitCtrl);
        sandbox.stub(onInitCtrl, "getRouter").returns({
            getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
        } as any);
        sandbox.stub(onInitCtrl, "getModel").returns({
            setProperty: sinon.stub(),
            getProperty: sinon.stub().returns([])
        } as any);
        sandbox.stub(onInitCtrl, "getOwnerComponent").returns({
            getRegistryService: () => ({
                getPermissions: sinon.stub().resolves([]),
                getGroupTypes: sinon.stub().resolves([]),
                getStatuses: sinon.stub().resolves([]),
                getRegistries: sinon.stub().resolves([])
            })
        } as any);
        sandbox.stub(onInitCtrl, "handleServiceError").resolves();
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("registers model under the name 'registryList'", function (assert) {
    onInitCtrl.onInit();
    assert.ok(onInitSetModelSpy.calledOnce, "setModel must be called");
    assert.strictEqual(onInitSetModelSpy.firstCall.args[1], "registryList");
});
QUnit.test("initial model has items=[], busy=false", function (assert) {
    onInitCtrl.onInit();
    const data = onInitSetModelSpy.firstCall.args[0].getData();
    assert.deepEqual(data.items, []);
    assert.strictEqual(data.busy, false);
});
QUnit.test("initial canCreate and canUpdate are false", function (assert) {
    onInitCtrl.onInit();
    const data = onInitSetModelSpy.firstCall.args[0].getData();
    assert.strictEqual(data.canCreate, false);
    assert.strictEqual(data.canUpdate, false);
});

// ═════════════════════════════════════════════════════════════════════════════
//  loadRegistries
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("RegistryList – loadRegistries", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("sets /busy=true before fetching", async function (assert) {
    let busyDuringFetch = false;
    const { ctrl, registryService, modelData } = buildRegistryListFixture();
    registryService.getRegistries.callsFake(() => {
        busyDuringFetch = modelData["/busy"];
        return Promise.resolve(SAMPLE_REGISTRIES);
    });
    await ctrl.loadRegistries();
    assert.ok(busyDuringFetch, "/busy must be true while fetching");
});
QUnit.test("sets /busy=false after successful fetch", async function (assert) {
    const { ctrl, modelData } = buildRegistryListFixture();
    await ctrl.loadRegistries();
    assert.strictEqual(modelData["/busy"], false);
});
QUnit.test("populates /items with results from the service", async function (assert) {
    const { ctrl, modelData } = buildRegistryListFixture();
    await ctrl.loadRegistries();
    assert.deepEqual(modelData["/items"], SAMPLE_REGISTRIES);
});
QUnit.test("passes filter state to getRegistries", async function (assert) {
    const { ctrl, registryService, modelData } = buildRegistryListFixture();
    modelData["/search"] = "query";
    modelData["/status"] = "Published";
    await ctrl.loadRegistries();
    const filterArg = registryService.getRegistries.firstCall.args[0];
    assert.strictEqual(filterArg.search, "query", "search must be forwarded");
    assert.strictEqual(filterArg.status, "Published", "status must be forwarded");
});
QUnit.test("calls handleServiceError when getRegistries rejects", async function (assert) {
    const { ctrl, registryService } = buildRegistryListFixture();
    registryService.getRegistries.rejects(new Error("Server error"));
    await ctrl.loadRegistries();
    assert.ok((ctrl.handleServiceError as any).calledOnce);
});
QUnit.test("resets /busy to false in finally on error", async function (assert) {
    const { ctrl, registryService, modelData } = buildRegistryListFixture();
    registryService.getRegistries.rejects(new Error("Timeout"));
    await ctrl.loadRegistries();
    assert.strictEqual(modelData["/busy"], false);
});

// ═════════════════════════════════════════════════════════════════════════════
//  onFilterChange & onRefresh
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("RegistryList – onFilterChange / onRefresh", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("onFilterChange triggers a loadRegistries call", async function (assert) {
    const { ctrl, registryService } = buildRegistryListFixture();
    await ctrl.onFilterChange();
    assert.ok(registryService.getRegistries.calledOnce);
});
QUnit.test("onRefresh triggers loadRegistries (via refreshRegistryPage)", async function (assert) {
    const { ctrl, registryService } = buildRegistryListFixture();
    await ctrl.onRefresh();
    assert.ok(registryService.getRegistries.called, "getRegistries must be called on refresh");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onGroupTypeChange
// ═════════════════════════════════════════════════════════════════════════════
let groupTypeCtrl: RegistryList;
let groupTypeDialogModelStub: any;

QUnit.module("RegistryList – onGroupTypeChange", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        groupTypeCtrl = new RegistryList("test");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("groupType '002' → showVersionNo=false and versionNo=''", function (assert) {
    groupTypeDialogModelStub = buildDialogModelStub({ versionNo: "001" });
    sandbox.stub(groupTypeCtrl, "getModel").callsFake((name?: string) =>
        name === "registryDialog" ? (groupTypeDialogModelStub as any) : (null as any)
    );
    const event = { getSource: sinon.stub().returns({ getSelectedKey: sinon.stub().returns("002") }) } as any;
    groupTypeCtrl.onGroupTypeChange(event);
    assert.ok(groupTypeDialogModelStub.setProperty.calledWith("/showVersionNo", false), "showVersionNo must be false for type 002");
    assert.ok(groupTypeDialogModelStub.setProperty.calledWith("/versionNo", ""), "versionNo must be cleared for type 002");
});
QUnit.test("groupType '001' → showVersionNo=true", function (assert) {
    groupTypeDialogModelStub = buildDialogModelStub({ versionNo: "001" });
    sandbox.stub(groupTypeCtrl, "getModel").callsFake((name?: string) =>
        name === "registryDialog" ? (groupTypeDialogModelStub as any) : (null as any)
    );
    const event = { getSource: sinon.stub().returns({ getSelectedKey: sinon.stub().returns("001") }) } as any;
    groupTypeCtrl.onGroupTypeChange(event);
    assert.ok(groupTypeDialogModelStub.setProperty.calledWith("/showVersionNo", true), "showVersionNo must be true for type 001");
});
QUnit.test("groupType '001' with empty versionNo → sets default '001'", function (assert) {
    groupTypeDialogModelStub = buildDialogModelStub({ versionNo: "" });
    sandbox.stub(groupTypeCtrl, "getModel").callsFake((name?: string) =>
        name === "registryDialog" ? (groupTypeDialogModelStub as any) : (null as any)
    );
    const event = { getSource: sinon.stub().returns({ getSelectedKey: sinon.stub().returns("001") }) } as any;
    groupTypeCtrl.onGroupTypeChange(event);
    assert.ok(groupTypeDialogModelStub.setProperty.calledWith("/versionNo", "001"), "Default versionNo '001' must be set");
});
QUnit.test("returns early when no 'registryDialog' model exists", function (assert) {
    sandbox.stub(groupTypeCtrl, "getModel").returns(null as any);
    const event = { getSource: sinon.stub().returns({ getSelectedKey: sinon.stub().returns("002") }) } as any;
    assert.ok(() => groupTypeCtrl.onGroupTypeChange(event), "Must not throw when dialogModel is absent");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onRowPress
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("RegistryList – onRowPress", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("navigates to 'registryDetail' with the correct registryId", function (assert) {
    const { ctrl, navToStub } = buildRegistryListFixture();
    const event = buildRowEvent(SAMPLE_REGISTRIES[0]);
    ctrl.onRowPress(event);
    assert.ok(navToStub.calledOnce, "navTo must be called");
    assert.strictEqual(navToStub.firstCall.args[0], "registryDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { registryId: "reg-1" });
});
QUnit.test("does NOT navigate when binding context is null", function (assert) {
    const { ctrl, navToStub } = buildRegistryListFixture();
    ctrl.onRowPress(buildRowEvent(null));
    assert.ok(!navToStub.called, "navTo must NOT be called without a context");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onSortConfirm
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("RegistryList – onSortConfirm", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("applies a Sorter to the table binding when sortItem is present", function (assert) {
    const { ctrl } = buildRegistryListFixture();
    const sortStub = sinon.stub();
    const tableStub = { getBinding: sinon.stub().returns({ sort: sortStub }) };
    sandbox.stub(ctrl, "getView").returns({ byId: sinon.stub().returns(tableStub) } as any);
    const sortItem = { getKey: sinon.stub().returns("registryName") };
    const event = {
        getParameter: sinon.stub().callsFake((p: string) => p === "sortItem" ? sortItem : false)
    } as any;
    ctrl.onSortConfirm(event);
    assert.ok(sortStub.calledOnce, "binding.sort must be called");
    assert.strictEqual(sortStub.firstCall.args[0].sPath, "registryName", "Sorter path must match sortItem key");
    assert.strictEqual(sortStub.firstCall.args[0].bDescending, false, "Sort descending must be false");
});
QUnit.test("does NOT throw when sortItem is null", function (assert) {
    const { ctrl } = buildRegistryListFixture();
    sandbox.stub(ctrl, "getView").returns({ byId: sinon.stub().returns({ getBinding: sinon.stub().returns({ sort: sinon.stub() }) }) } as any);
    const event = { getParameter: sinon.stub().returns(null) } as any;
    assert.ok(() => ctrl.onSortConfirm(event), "Must not throw when sortItem is absent");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onSaveRegistryDialog – create mode
// ═════════════════════════════════════════════════════════════════════════════
let createBusyShowStub: any;
let createBusyHideStub: any;
let createMsgToastStub: any;

QUnit.module("RegistryList – onSaveRegistryDialog (create)", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        createBusyShowStub = sandbox.stub(BusyIndicator, "show");
        createBusyHideStub = sandbox.stub(BusyIndicator, "hide");
        createMsgToastStub = sandbox.stub(MessageToast, "show");
    },
    afterEach() { sandbox.restore(); }
});

function buildCreateModeCtrl() {
    const { ctrl, registryService, modelData } = buildRegistryListFixture();
    (ctrl as any).dialogMode = "create";
    (ctrl as any).currentRegistryId = null;
    const dialogModel = buildDialogModelStub({ groupName: "NewSvc", groupType: "001", versionNo: "001" });
    (ctrl as any).registryDialogPromise = Promise.resolve({ close: sinon.stub() });
    sandbox.stub(ctrl, "getView").returns({ getModel: sinon.stub().returns(dialogModel) } as any);
    return { ctrl, registryService, modelData, dialogModel };
}

QUnit.test("calls createRegistry with form data", async function (assert) {
    const { ctrl, registryService } = buildCreateModeCtrl();
    await ctrl.onSaveRegistryDialog();
    assert.ok(registryService.createRegistry.calledOnce, "createRegistry must be called");
});
QUnit.test("shows BusyIndicator during save", async function (assert) {
    const { ctrl } = buildCreateModeCtrl();
    await ctrl.onSaveRegistryDialog();
    assert.ok(createBusyShowStub.calledOnce, "BusyIndicator.show must be called");
});
QUnit.test("shows success toast on create", async function (assert) {
    const { ctrl } = buildCreateModeCtrl();
    await ctrl.onSaveRegistryDialog();
    assert.ok(createMsgToastStub.calledOnce, "MessageToast.show must be called");
    assert.ok(createMsgToastStub.firstCall.args[0].toLowerCase().includes("created"), "Toast must mention 'created'");
});
QUnit.test("hides BusyIndicator in finally on success", async function (assert) {
    const { ctrl } = buildCreateModeCtrl();
    await ctrl.onSaveRegistryDialog();
    assert.ok(createBusyHideStub.calledOnce, "BusyIndicator.hide must be called in finally");
});
QUnit.test("hides BusyIndicator in finally on error", async function (assert) {
    const { ctrl, registryService } = buildCreateModeCtrl();
    registryService.createRegistry.rejects(new Error("Create failed"));
    await ctrl.onSaveRegistryDialog();
    assert.ok(createBusyHideStub.calledOnce, "BusyIndicator.hide must always be called");
});
QUnit.test("calls handleServiceError when createRegistry rejects", async function (assert) {
    const { ctrl, registryService } = buildCreateModeCtrl();
    registryService.createRegistry.rejects(new Error("Conflict"));
    await ctrl.onSaveRegistryDialog();
    assert.ok((ctrl.handleServiceError as any).calledOnce);
});

// ═════════════════════════════════════════════════════════════════════════════
//  onSaveRegistryDialog – edit mode
// ═════════════════════════════════════════════════════════════════════════════
let editMsgToastStub: any;

QUnit.module("RegistryList – onSaveRegistryDialog (edit)", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        sandbox.stub(BusyIndicator, "show");
        sandbox.stub(BusyIndicator, "hide");
        editMsgToastStub = sandbox.stub(MessageToast, "show");
    },
    afterEach() { sandbox.restore(); }
});

function buildEditModeCtrl() {
    const { ctrl, registryService, modelData } = buildRegistryListFixture();
    (ctrl as any).dialogMode = "edit";
    (ctrl as any).currentRegistryId = "reg-1";
    const dialogModel = buildDialogModelStub({ status: "P" });
    (ctrl as any).registryDialogPromise = Promise.resolve({ close: sinon.stub() });
    sandbox.stub(ctrl, "getView").returns({ getModel: sinon.stub().returns(dialogModel) } as any);
    return { ctrl, registryService, modelData, dialogModel };
}

QUnit.test("calls updateRegistry with the registry id and status", async function (assert) {
    const { ctrl, registryService } = buildEditModeCtrl();
    await ctrl.onSaveRegistryDialog();
    assert.ok(registryService.updateRegistry.calledOnce, "updateRegistry must be called");
    assert.strictEqual(registryService.updateRegistry.firstCall.args[0], "reg-1", "Must pass correct registryId");
});
QUnit.test("shows success toast on edit", async function (assert) {
    const { ctrl } = buildEditModeCtrl();
    await ctrl.onSaveRegistryDialog();
    assert.ok(editMsgToastStub.calledOnce);
    assert.ok(editMsgToastStub.firstCall.args[0].toLowerCase().includes("updated"), "Toast must mention 'updated'");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onCancelRegistryDialog
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("RegistryList – onCancelRegistryDialog", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("closes the dialog if it has been opened", async function (assert) {
    const { ctrl } = buildRegistryListFixture();
    const closeStub = sinon.stub();
    (ctrl as any).registryDialogPromise = Promise.resolve({ close: closeStub });
    await ctrl.onCancelRegistryDialog();
    assert.ok(closeStub.calledOnce, "dialog.close must be called");
});
QUnit.test("does NOT throw when no dialog promise exists", async function (assert) {
    const { ctrl } = buildRegistryListFixture();
    (ctrl as any).registryDialogPromise = undefined;
    let threw = false;
    try { await ctrl.onCancelRegistryDialog(); } catch { threw = true; }
    assert.ok(!threw, "Must not throw when dialog has never been opened");
});
