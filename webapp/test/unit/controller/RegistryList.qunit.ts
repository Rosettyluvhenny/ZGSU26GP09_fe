/**
 * QUnit tests for RegistryList controller
 */
import RegistryList from "com/zgp9/fe/controller/RegistryList.controller";
import MessageToast from "sap/m/MessageToast";
import BusyIndicator from "sap/ui/core/BusyIndicator";

let sandbox: any;

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

interface RegistryListFixture {
    ctrl: RegistryList;
    modelData: Record<string, any>;
    registryService: any;
    navToStub: any;
}

function buildRegistryListFixture(): RegistryListFixture {
    const ctrl = new RegistryList("test");
    const modelData: Record<string, any> = {
        "/items": [], "/busy": false, "/search": "", "/searchField": "all",
        "/status": "All", "/groupType": "All", "/registryName": "", "/createdBy": "",
        "/groupTypes": [], "/statuses": []
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
        getPermissions: sinon.stub().resolves(["Registry.Create", "Registry.Update"]),
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

    return { ctrl, modelData, registryService, navToStub };
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

QUnit.module("RegistryList – onInit", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("registers registryList model with empty defaults", function (assert) {
    const ctrl = new RegistryList("test");
    const setModelSpy = sandbox.stub(ctrl, "setModel").returns(ctrl);
    sandbox.stub(ctrl, "getRouter").returns({
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
    } as any);
    sandbox.stub(ctrl, "getModel").returns({
        setProperty: sinon.stub(),
        getProperty: sinon.stub().returns([])
    } as any);
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getRegistryService: () => ({
            getPermissions: sinon.stub().resolves([]),
            getGroupTypes: sinon.stub().resolves([]),
            getStatuses: sinon.stub().resolves([]),
            getRegistries: sinon.stub().resolves([])
        })
    } as any);
    sandbox.stub(ctrl, "handleServiceError").resolves();

    ctrl.onInit();
    assert.strictEqual(setModelSpy.firstCall.args[1], "registryList");
    const data = setModelSpy.firstCall.args[0].getData();
    assert.deepEqual(data.items, []);
    assert.strictEqual(data.busy, false);
    assert.strictEqual(data.status, "All");
});

QUnit.module("RegistryList – loadRegistries", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("fetches with filters and toggles busy", async function (assert) {
    let busyDuringFetch = false;
    const { ctrl, registryService, modelData } = buildRegistryListFixture();
    modelData["/search"] = "query";
    modelData["/status"] = "Published";
    registryService.getRegistries.callsFake(() => {
        busyDuringFetch = modelData["/busy"];
        return Promise.resolve(SAMPLE_REGISTRIES);
    });
    await ctrl.loadRegistries();
    assert.ok(busyDuringFetch);
    assert.strictEqual(registryService.getRegistries.firstCall.args[0].search, "query");
    assert.strictEqual(registryService.getRegistries.firstCall.args[0].status, "Published");
    assert.deepEqual(modelData["/items"], SAMPLE_REGISTRIES);
    assert.strictEqual(modelData["/busy"], false);
});

QUnit.test("handles errors and resets busy", async function (assert) {
    const { ctrl, registryService, modelData } = buildRegistryListFixture();
    registryService.getRegistries.rejects(new Error("Server error"));
    await ctrl.loadRegistries();
    assert.ok((ctrl.handleServiceError as any).calledOnce);
    assert.strictEqual(modelData["/busy"], false);
});

QUnit.module("RegistryList – onFilterChange", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("reloads registries on filter change", async function (assert) {
    const { ctrl, registryService } = buildRegistryListFixture();
    await ctrl.onFilterChange();
    assert.ok(registryService.getRegistries.calledOnce);
});

QUnit.module("RegistryList – onGroupTypeChange", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("toggles versionNo visibility by group type", function (assert) {
    const ctrl = new RegistryList("test");
    const dialog002 = buildDialogModelStub({ versionNo: "001" });
    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "registryDialog" ? (dialog002 as any) : null
    );
    ctrl.onGroupTypeChange({ getSource: sinon.stub().returns({ getSelectedKey: sinon.stub().returns("002") }) } as any);
    assert.ok(dialog002.setProperty.calledWith("/showVersionNo", false));
    assert.ok(dialog002.setProperty.calledWith("/versionNo", ""));

    sandbox.restore();
    sandbox = (sinon as any).sandbox.create();
    const dialog001 = buildDialogModelStub({ versionNo: "" });
    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "registryDialog" ? (dialog001 as any) : null
    );
    ctrl.onGroupTypeChange({ getSource: sinon.stub().returns({ getSelectedKey: sinon.stub().returns("001") }) } as any);
    assert.ok(dialog001.setProperty.calledWith("/showVersionNo", true));
    assert.ok(dialog001.setProperty.calledWith("/versionNo", "001"));
});

QUnit.module("RegistryList – onRowPress", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("navigates to registryDetail or skips null context", function (assert) {
    const { ctrl, navToStub } = buildRegistryListFixture();
    ctrl.onRowPress(buildRowEvent(SAMPLE_REGISTRIES[0]));
    assert.strictEqual(navToStub.firstCall.args[0], "registryDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { registryId: "reg-1" });

    navToStub.resetHistory();
    ctrl.onRowPress(buildRowEvent(null));
    assert.ok(!navToStub.called);
});

QUnit.module("RegistryList – onSortConfirm", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("applies sorter when sortItem is present", function (assert) {
    const { ctrl } = buildRegistryListFixture();
    const sortStub = sinon.stub();
    sandbox.stub(ctrl, "getView").returns({
        byId: sinon.stub().returns({ getBinding: sinon.stub().returns({ sort: sortStub }) })
    } as any);
    const sortItem = { getKey: sinon.stub().returns("registryName") };
    ctrl.onSortConfirm({
        getParameter: sinon.stub().callsFake((p: string) => p === "sortItem" ? sortItem : false)
    } as any);
    assert.ok(sortStub.calledOnce);
    assert.strictEqual(sortStub.firstCall.args[0].sPath, "registryName");
});

QUnit.module("RegistryList – onSaveRegistryDialog", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        sandbox.stub(BusyIndicator, "show");
        sandbox.stub(BusyIndicator, "hide");
        sandbox.stub(MessageToast, "show");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("creates registry successfully", async function (assert) {
    const { ctrl, registryService } = buildRegistryListFixture();
    (ctrl as any).dialogMode = "create";
    (ctrl as any).currentRegistryId = null;
    (ctrl as any).registryDialogPromise = Promise.resolve({ close: sinon.stub() });
    sandbox.stub(ctrl, "getView").returns({
        getModel: sinon.stub().returns(buildDialogModelStub({ groupName: "NewSvc", groupType: "001", versionNo: "001" }))
    } as any);

    await ctrl.onSaveRegistryDialog();
    assert.ok(registryService.createRegistry.calledOnce);
    assert.ok((BusyIndicator.show as any).calledOnce);
    assert.ok((BusyIndicator.hide as any).calledOnce);
    assert.ok((MessageToast.show as any).firstCall.args[0].toLowerCase().includes("created"));
});

QUnit.test("updates registry successfully", async function (assert) {
    const { ctrl, registryService } = buildRegistryListFixture();
    (ctrl as any).dialogMode = "edit";
    (ctrl as any).currentRegistryId = "reg-1";
    (ctrl as any).registryDialogPromise = Promise.resolve({ close: sinon.stub() });
    sandbox.stub(ctrl, "getView").returns({
        getModel: sinon.stub().returns(buildDialogModelStub({ status: "P" }))
    } as any);

    await ctrl.onSaveRegistryDialog();
    assert.ok(registryService.updateRegistry.calledOnce);
    assert.strictEqual(registryService.updateRegistry.firstCall.args[0], "reg-1");
    assert.ok((MessageToast.show as any).firstCall.args[0].toLowerCase().includes("updated"));
});

QUnit.test("handles create errors and hides busy", async function (assert) {
    const { ctrl, registryService } = buildRegistryListFixture();
    (ctrl as any).dialogMode = "create";
    (ctrl as any).currentRegistryId = null;
    (ctrl as any).registryDialogPromise = Promise.resolve({ close: sinon.stub() });
    sandbox.stub(ctrl, "getView").returns({
        getModel: sinon.stub().returns(buildDialogModelStub())
    } as any);
    registryService.createRegistry.rejects(new Error("Conflict"));

    await ctrl.onSaveRegistryDialog();
    assert.ok((ctrl.handleServiceError as any).calledOnce);
    assert.ok((BusyIndicator.hide as any).calledOnce);
});

QUnit.module("RegistryList – onCancelRegistryDialog", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("closes dialog when open, otherwise no-op", async function (assert) {
    const { ctrl } = buildRegistryListFixture();
    const closeStub = sinon.stub();
    (ctrl as any).registryDialogPromise = Promise.resolve({ close: closeStub });
    await ctrl.onCancelRegistryDialog();
    assert.ok(closeStub.calledOnce);

    (ctrl as any).registryDialogPromise = undefined;
    let threw = false;
    try { await ctrl.onCancelRegistryDialog(); } catch { threw = true; }
    assert.ok(!threw);
});
