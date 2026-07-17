/**
 * QUnit tests for JobList controller
 * SAP UI5 flat-module form + sinon.sandbox pattern (sinon 1.x/4.x compatible).
 */

import JobList from "com/zgp9/fe/controller/JobList.controller";
import MessageToast from "sap/m/MessageToast";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import type { Job } from "com/zgp9/fe/model/types";

// sinon: typed via webapp/test/sinon-global.d.ts (uses @types/sinon)

let sandbox: any;

// ─────────────────────────────────────────────────────────────────────────────
//  Sample data
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLE_JOBS: Job[] = [
    { id: "job-1", status: "Completed", executedBy: "alice", startedAt: "2024-01-01T08:00:00Z", finishedAt: "2024-01-01T08:05:00Z", durationMs: 300000, triggerType: "MANUAL", totalRegistry: 5, changeCount: 2, newVersionCount: 1, logs: [], errorMessage: "", summary: "" },
    { id: "job-2", status: "Running",   executedBy: "system", startedAt: "2024-01-02T09:00:00Z", finishedAt: null, durationMs: null, triggerType: "SCHEDULE", totalRegistry: 10, changeCount: 0, newVersionCount: 0, logs: [], errorMessage: "", summary: "" }
];

// ─────────────────────────────────────────────────────────────────────────────
//  Fixture builder
// ─────────────────────────────────────────────────────────────────────────────
interface JobListFixture {
    ctrl: JobList;
    modelData: Record<string, any>;
    modelStub: any;
    uiModelData: Record<string, any>;
    uiModelStub: any;
    jobService: any;
    registryService: any;
    navToStub: any;
}

function buildJobListFixture(permissions: string[] = ["ScanJob.Execute"]): JobListFixture {
    const ctrl = new JobList("test");

    const modelData: Record<string, any> = { "/items": [], "/busy": false, "/search": "" };
    const modelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { modelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => modelData[p])
    };

    const uiModelData: Record<string, any> = { "/canExecuteScanJob": false };
    const uiModelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { uiModelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => uiModelData[p])
    };

    const jobService = { getJobs: sinon.stub().resolves(SAMPLE_JOBS), runScanJob: sinon.stub().resolves() };
    const registryService = { getPermissions: sinon.stub().resolves(permissions) };
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
        getJobService: () => jobService,
        getRegistryService: () => registryService
    } as any);

    return { ctrl, modelData, modelStub, uiModelData, uiModelStub, jobService, registryService, navToStub };
}

function buildRowPressEvent(job: { id: string } | null) {
    const context = job ? { getObject: sinon.stub().returns(job) } : null;
    return {
        getSource: sinon.stub().returns({ getBindingContext: sinon.stub().returns(context) })
    } as any;
}

// ═════════════════════════════════════════════════════════════════════════════
//  onInit
// ═════════════════════════════════════════════════════════════════════════════
let onInitCtrl: JobList;
let onInitSetModelSpy: any;

QUnit.module("JobList – onInit", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        onInitCtrl = new JobList("test");
        onInitSetModelSpy = sandbox.stub(onInitCtrl, "setModel").returns(onInitCtrl);
        sandbox.stub(onInitCtrl, "getRouter").returns({
            getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
        } as any);
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("registers model under the name 'jobList'", function (assert) {
    onInitCtrl.onInit();
    assert.ok(onInitSetModelSpy.calledOnce, "setModel must be called");
    assert.strictEqual(onInitSetModelSpy.firstCall.args[1], "jobList");
});
QUnit.test("initial model has empty items array", function (assert) {
    onInitCtrl.onInit();
    assert.deepEqual(onInitSetModelSpy.firstCall.args[0].getData().items, []);
});
QUnit.test("initial model has busy=false", function (assert) {
    onInitCtrl.onInit();
    assert.strictEqual(onInitSetModelSpy.firstCall.args[0].getData().busy, false);
});
QUnit.test("initial model has empty search string", function (assert) {
    onInitCtrl.onInit();
    assert.strictEqual(onInitSetModelSpy.firstCall.args[0].getData().search, "");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onRouteMatched
// ═════════════════════════════════════════════════════════════════════════════
let routeMatchedMsgToastStub: any;

QUnit.module("JobList – onRouteMatched", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        routeMatchedMsgToastStub = sandbox.stub(MessageToast, "show");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("calls loadJobs when ScanJob.Execute permission is granted", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture(["ScanJob.Execute"]);
    await ctrl.onRouteMatched();
    assert.ok(jobService.getJobs.calledOnce, "getJobs must be called when permission is granted");
});
QUnit.test("sets canExecuteScanJob=true in uiModel when permission granted", async function (assert) {
    const { ctrl, uiModelData } = buildJobListFixture(["ScanJob.Execute"]);
    await ctrl.onRouteMatched();
    assert.strictEqual(uiModelData["/canExecuteScanJob"], true);
});
QUnit.test("shows AccessDenied toast when ScanJob.Execute is NOT in permissions", async function (assert) {
    const { ctrl } = buildJobListFixture([]);
    await ctrl.onRouteMatched();
    assert.ok(routeMatchedMsgToastStub.calledOnce, "MessageToast.show must be called");
});
QUnit.test("navigates to 'home' when permission is NOT granted", async function (assert) {
    const { ctrl, navToStub } = buildJobListFixture([]);
    await ctrl.onRouteMatched();
    assert.ok(navToStub.calledWith("home", {}, true), "Must redirect to 'home'");
});
QUnit.test("does NOT call loadJobs when permission is NOT granted", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture([]);
    await ctrl.onRouteMatched();
    assert.ok(!jobService.getJobs.called, "getJobs must NOT be called without permission");
});
QUnit.test("calls handleServiceError when getPermissions rejects", async function (assert) {
    const { ctrl, registryService } = buildJobListFixture();
    registryService.getPermissions.rejects(new Error("Network error"));
    await ctrl.onRouteMatched();
    assert.ok((ctrl.handleServiceError as any).calledOnce, "handleServiceError must be called");
});

// ═════════════════════════════════════════════════════════════════════════════
//  loadJobs
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("JobList – loadJobs", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("sets /busy=true before calling the service", async function (assert) {
    let busyDuringCall = false;
    const { ctrl, jobService, modelData } = buildJobListFixture();
    jobService.getJobs.callsFake(() => {
        busyDuringCall = modelData["/busy"];
        return Promise.resolve(SAMPLE_JOBS);
    });
    await ctrl.loadJobs();
    assert.ok(busyDuringCall, "/busy must be true while the service is called");
});
QUnit.test("sets /busy=false after successful fetch", async function (assert) {
    const { ctrl, modelData } = buildJobListFixture();
    await ctrl.loadJobs();
    assert.strictEqual(modelData["/busy"], false, "/busy must be false after completion");
});
QUnit.test("populates /items with the jobs returned by the service", async function (assert) {
    const { ctrl, modelData } = buildJobListFixture();
    await ctrl.loadJobs();
    assert.deepEqual(modelData["/items"], SAMPLE_JOBS);
});
QUnit.test("passes current /search value to getJobs", async function (assert) {
    const { ctrl, jobService, modelData } = buildJobListFixture();
    modelData["/search"] = "alice";
    await ctrl.loadJobs();
    assert.ok(jobService.getJobs.calledWith("alice"), "getJobs must receive the search string");
});
QUnit.test("calls handleServiceError when getJobs rejects", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    jobService.getJobs.rejects(new Error("Server error"));
    await ctrl.loadJobs();
    assert.ok((ctrl.handleServiceError as any).calledOnce, "handleServiceError must be called on error");
});
QUnit.test("resets /busy to false even when an error occurs", async function (assert) {
    const { ctrl, jobService, modelData } = buildJobListFixture();
    jobService.getJobs.rejects(new Error("Timeout"));
    await ctrl.loadJobs();
    assert.strictEqual(modelData["/busy"], false, "/busy must be false in finally block");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onRefresh
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("JobList – onRefresh", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("delegates to loadJobs (fetches jobs)", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    await ctrl.onRefresh();
    assert.ok(jobService.getJobs.calledOnce, "getJobs must be called via onRefresh");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onSearchLiveChange
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("JobList – onSearchLiveChange", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("updates /search in the model", async function (assert) {
    const { ctrl, modelData } = buildJobListFixture();
    const event = { getSource: sinon.stub().returns({ getValue: sinon.stub().returns("mySearch") }) } as any;
    await ctrl.onSearchLiveChange(event);
    assert.strictEqual(modelData["/search"], "mySearch");
});
QUnit.test("triggers a new loadJobs call", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    const event = { getSource: sinon.stub().returns({ getValue: sinon.stub().returns("test") }) } as any;
    await ctrl.onSearchLiveChange(event);
    assert.ok(jobService.getJobs.calledOnce, "loadJobs must fire after search change");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onRowPress
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("JobList – onRowPress", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("navigates to 'jobDetail' with the correct jobId", function (assert) {
    const { ctrl, navToStub } = buildJobListFixture();
    const event = buildRowPressEvent({ id: "job-1" });
    ctrl.onRowPress(event);
    assert.ok(navToStub.calledOnce, "navTo must be called");
    assert.strictEqual(navToStub.firstCall.args[0], "jobDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { jobId: "job-1" });
});
QUnit.test("does NOT navigate when binding context is null", function (assert) {
    const { ctrl, navToStub } = buildJobListFixture();
    const event = buildRowPressEvent(null);
    ctrl.onRowPress(event);
    assert.ok(!navToStub.called, "navTo must NOT be called when there is no context");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onRunScanJob
// ═════════════════════════════════════════════════════════════════════════════
let busyShowStub: any;
let busyHideStub: any;
let runMsgToastStub: any;

QUnit.module("JobList – onRunScanJob", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        busyShowStub = sandbox.stub(BusyIndicator, "show");
        busyHideStub = sandbox.stub(BusyIndicator, "hide");
        runMsgToastStub = sandbox.stub(MessageToast, "show");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("shows BusyIndicator before starting the job", async function (assert) {
    const { ctrl } = buildJobListFixture();
    await ctrl.onRunScanJob();
    assert.ok(busyShowStub.calledOnce, "BusyIndicator.show must be called");
});
QUnit.test("hides BusyIndicator in finally block on success", async function (assert) {
    const { ctrl } = buildJobListFixture();
    await ctrl.onRunScanJob();
    assert.ok(busyHideStub.calledOnce, "BusyIndicator.hide must be called after success");
});
QUnit.test("calls runScanJob on the job service", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    await ctrl.onRunScanJob();
    assert.ok(jobService.runScanJob.calledOnce, "jobService.runScanJob must be called");
});
QUnit.test("shows a success toast after the job starts", async function (assert) {
    const { ctrl } = buildJobListFixture();
    await ctrl.onRunScanJob();
    assert.ok(runMsgToastStub.calledOnce, "MessageToast.show must be called on success");
});
QUnit.test("reloads job list after starting the scan job", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    await ctrl.onRunScanJob();
    assert.ok(jobService.getJobs.calledOnce, "Job list must be refreshed after running the scan job");
});
QUnit.test("calls handleServiceError when runScanJob rejects", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    const error = new Error("Job start failed");
    jobService.runScanJob.rejects(error);
    await ctrl.onRunScanJob();
    assert.ok((ctrl.handleServiceError as any).calledOnceWith(error), "handleServiceError must be called with the error");
});
QUnit.test("hides BusyIndicator even when runScanJob rejects", async function (assert) {
    const { ctrl, jobService } = buildJobListFixture();
    jobService.runScanJob.rejects(new Error("Failed"));
    await ctrl.onRunScanJob();
    assert.ok(busyHideStub.calledOnce, "BusyIndicator.hide must always be called");
});
