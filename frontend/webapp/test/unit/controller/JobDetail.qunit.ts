/**
 * QUnit tests for JobDetail controller
 */
import JobDetail from "com/zgp9/fe/controller/JobDetail.controller";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import type { Job } from "com/zgp9/fe/model/types";

let sandbox: any;

const SAMPLE_JOB: Job = {
    id: "job-42",
    status: "Completed",
    executedBy: "alice",
    startedAt: "2024-01-01T08:00:00Z",
    finishedAt: "2024-01-01T08:05:00Z",
    durationMs: 300000,
    triggerType: "MANUAL",
    triggerText: "Manual",
    totalRegistry: 5,
    changeCount: 2,
    newVersionCount: 1,
    logs: [],
    errorMessage: "",
    summary: "Done"
};

interface JobDetailFixture {
    ctrl: JobDetail;
    modelData: Record<string, any>;
    jobService: any;
}

function buildFixture(): JobDetailFixture {
    const ctrl = new JobDetail("test");
    const modelData: Record<string, any> = { "/busy": false, "/job": null };
    const modelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { modelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => modelData[p]),
        setData: sinon.stub().callsFake((data: any) => {
            Object.keys(data).forEach((k) => { modelData[`/${k}`] = data[k]; });
        })
    };
    const jobService = { getJob: sinon.stub().resolves(SAMPLE_JOB) };

    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "jobDetail" ? (modelStub as any) : null
    );
    sandbox.stub(ctrl, "getRouter").returns({
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() }),
        navTo: sinon.stub()
    } as any);
    sandbox.stub(ctrl, "handleServiceError").resolves();
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getJobService: () => jobService
    } as any);
    sandbox.stub(BusyIndicator, "show");
    sandbox.stub(BusyIndicator, "hide");

    return { ctrl, modelData, jobService };
}

function routeEvent(jobId?: string) {
    return {
        getParameter: sinon.stub().withArgs("arguments").returns(jobId ? { jobId } : {})
    } as any;
}

QUnit.module("JobDetail – onInit", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("registers jobDetail model with defaults", function (assert) {
    const ctrl = new JobDetail("test");
    const setModelSpy = sandbox.stub(ctrl, "setModel").returns(ctrl);
    sandbox.stub(ctrl, "getRouter").returns({
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() })
    } as any);
    ctrl.onInit();
    assert.strictEqual(setModelSpy.firstCall.args[1], "jobDetail");
    const data = setModelSpy.firstCall.args[0].getData();
    assert.strictEqual(data.busy, false);
    assert.strictEqual(data.job, null);
});

QUnit.module("JobDetail – onRouteMatched", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("loads job when jobId is present", async function (assert) {
    const { ctrl, modelData, jobService } = buildFixture();
    await ctrl.onRouteMatched(routeEvent("job-42"));
    assert.ok(jobService.getJob.calledOnceWithExactly("job-42"));
    assert.deepEqual(modelData["/job"], SAMPLE_JOB);
    assert.strictEqual(modelData["/busy"], false);
});

QUnit.test("skips load when jobId is missing", async function (assert) {
    const { ctrl, jobService } = buildFixture();
    await ctrl.onRouteMatched(routeEvent());
    assert.ok(!jobService.getJob.called);
});

QUnit.test("handles getJob errors and resets busy", async function (assert) {
    const { ctrl, modelData, jobService } = buildFixture();
    jobService.getJob.rejects(new Error("boom"));
    await ctrl.onRouteMatched(routeEvent("job-42"));
    assert.ok((ctrl.handleServiceError as any).calledOnce);
    assert.strictEqual(modelData["/busy"], false);
});
