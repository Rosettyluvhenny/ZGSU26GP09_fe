/**
 * QUnit tests for JobList controller
 */
import JobList from "com/zgp9/fe/controller/JobList.controller";
import MessageToast from "sap/m/MessageToast";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Fragment from "sap/ui/core/Fragment";
import type { Job } from "com/zgp9/fe/model/types";

let sandbox: any;

const SAMPLE_JOBS: Job[] = [
    { id: "job-1", status: "Completed", executedBy: "alice", startedAt: "2024-01-01T08:00:00Z", finishedAt: "2024-01-01T08:05:00Z", durationMs: 300000, triggerType: "MANUAL", triggerText: "Manual", totalRegistry: 5, changeCount: 2, newVersionCount: 1, logs: [], errorMessage: "", summary: "" },
    { id: "job-2", status: "Running", executedBy: "system", startedAt: "2024-01-02T09:00:00Z", finishedAt: null, durationMs: null, triggerType: "SCHEDULE", triggerText: "Schedule", totalRegistry: 10, changeCount: 0, newVersionCount: 0, logs: [], errorMessage: "", summary: "" }
];

interface JobListFixture {
    ctrl: JobList;
    modelData: Record<string, any>;
    uiModelData: Record<string, any>;
    jobService: any;
    navToStub: any;
}

function buildJobListFixture(canExecute = true): JobListFixture {
    const ctrl = new JobList("test");
    const modelData: Record<string, any> = { "/items": [], "/busy": false, "/search": "", "/selectedJob": null };
    const modelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { modelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => modelData[p])
    };
    const uiModelData: Record<string, any> = { "/canExecuteScanJob": canExecute };
    const uiModelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { uiModelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => uiModelData[p])
    };
    const jobService = { getJobs: sinon.stub().resolves(SAMPLE_JOBS), runScanJob: sinon.stub().resolves() };
    const navToStub = sinon.stub();

    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "jobList" ? (modelStub as any) : (null as any)
    );
    sandbox.stub(ctrl, "getUiModel").returns(uiModelStub as any);
    sandbox.stub(ctrl, "getRouter").returns({
        navTo: navToStub,
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
    } as any);
    sandbox.stub(ctrl, "handleServiceError").resolves();
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getJobService: () => jobService
    } as any);
    sandbox.stub(ctrl, "getView").returns({
        getId: sinon.stub().returns("view"),
        addDependent: sinon.stub()
    } as any);

    return { ctrl, modelData, uiModelData, jobService, navToStub };
}

function buildRowPressEvent(job: { id: string } | null) {
    const context = job ? { getObject: sinon.stub().returns(job) } : null;
    return {
        getSource: sinon.stub().returns({ getBindingContext: sinon.stub().returns(context) })
    } as any;
}

QUnit.module("JobList – onInit", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("registers jobList model with empty defaults", function (assert) {
    const ctrl = new JobList("test");
    const setModelSpy = sandbox.stub(ctrl, "setModel").returns(ctrl);
    sandbox.stub(ctrl, "getRouter").returns({
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
    } as any);
    ctrl.onInit();
    assert.strictEqual(setModelSpy.firstCall.args[1], "jobList");
    const data = setModelSpy.firstCall.args[0].getData();
    assert.deepEqual(data.items, []);
    assert.strictEqual(data.busy, false);
    assert.strictEqual(data.search, "");
});

QUnit.module("JobList – onRouteMatched", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        sandbox.stub(MessageToast, "show");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("loads jobs when canExecuteScanJob is true", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture(true);
    await ctrl.onRouteMatched();
    assert.ok(jobService.getJobs.calledOnce);
});

QUnit.test("denies access when canExecuteScanJob is false", async function (assert) {
    const { ctrl, jobService, navToStub, uiModelData } = buildJobListFixture(false);
    assert.strictEqual(uiModelData["/canExecuteScanJob"], false);
    await ctrl.onRouteMatched();
    assert.ok((MessageToast.show as any).calledOnce, "Access denied toast");
    assert.strictEqual(navToStub.firstCall?.args[0], "home");
    assert.ok(!jobService.getJobs.called);
});

QUnit.module("JobList – loadJobs", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("fetches jobs with search and toggles busy", async function (assert) {
    let busyDuringCall = false;
    const { ctrl, jobService, modelData } = buildJobListFixture();
    modelData["/search"] = "alice";
    jobService.getJobs.callsFake(() => {
        busyDuringCall = modelData["/busy"];
        return Promise.resolve(SAMPLE_JOBS);
    });
    await ctrl.loadJobs();
    assert.ok(busyDuringCall);
    assert.ok(jobService.getJobs.calledWith("alice"));
    assert.deepEqual(modelData["/items"], SAMPLE_JOBS);
    assert.strictEqual(modelData["/busy"], false);
});

QUnit.test("handles service errors and resets busy", async function (assert) {
    const { ctrl, jobService, modelData } = buildJobListFixture();
    jobService.getJobs.rejects(new Error("Server error"));
    await ctrl.loadJobs();
    assert.ok((ctrl.handleServiceError as any).calledOnce);
    assert.strictEqual(modelData["/busy"], false);
});

QUnit.module("JobList – onSearchLiveChange", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("updates search and reloads jobs", async function (assert) {
    const { ctrl, modelData, jobService } = buildJobListFixture();
    const event = { getSource: sinon.stub().returns({ getValue: sinon.stub().returns("mySearch") }) } as any;
    await ctrl.onSearchLiveChange(event);
    assert.strictEqual(modelData["/search"], "mySearch");
    assert.ok(jobService.getJobs.calledOnce);
});

QUnit.module("JobList – onRowPress", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("selects job and opens detail dialog", async function (assert) {
    const { ctrl, modelData } = buildJobListFixture();
    const dialog = { open: sinon.stub() };
    const loadStub = sandbox.stub(Fragment, "load").resolves(dialog);
    ctrl.onRowPress(buildRowPressEvent({ id: "job-1" }));
    await loadStub.firstCall.returnValue;
    assert.strictEqual(modelData["/selectedJob"].id, "job-1");
    assert.ok(dialog.open.calledOnce);
});

QUnit.test("does nothing when binding context is null", function (assert) {
    const { ctrl, modelData } = buildJobListFixture();
    const loadStub = sandbox.stub(Fragment, "load");
    ctrl.onRowPress(buildRowPressEvent(null));
    assert.strictEqual(modelData["/selectedJob"], null);
    assert.ok(!loadStub.called);
});

QUnit.module("JobList – onRunScanJob", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        sandbox.stub(BusyIndicator, "show");
        sandbox.stub(BusyIndicator, "hide");
        sandbox.stub(MessageToast, "show");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("runs scan job, shows toast, and reloads list", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    await ctrl.onRunScanJob();
    assert.ok((BusyIndicator.show as any).calledOnce);
    assert.ok(jobService.runScanJob.calledOnce);
    assert.ok((MessageToast.show as any).calledOnce);
    assert.ok(jobService.getJobs.calledOnce);
    assert.ok((BusyIndicator.hide as any).calledOnce);
});

QUnit.test("handles runScanJob failure and still hides busy", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    const error = new Error("Job start failed");
    jobService.runScanJob.rejects(error);
    await ctrl.onRunScanJob();
    assert.ok((ctrl.handleServiceError as any).calledOnceWith(error));
    assert.ok((BusyIndicator.hide as any).calledOnce);
});
