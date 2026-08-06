/**
 * QUnit tests for the Home controller's pure helpers:
 * computeKpiDelta, bucketScanTrend, and buildActivity.
 * These are model/service-free, so the controller is exercised directly.
 */

import Home from "com/zgp9/fe/controller/Home.controller";
import type { Job, LogEntry, Registry } from "com/zgp9/fe/model/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const iso = (daysAgo: number): string => new Date(NOW - daysAgo * DAY_MS).toISOString();

function makeRegistry(overrides: Partial<Registry>): Registry {
    return {
        id: "reg",
        registryName: "REG",
        serviceName: "REG",
        serviceType: "RAP",
        status: "Published",
        statusText: "Published",
        description: "",
        createdBy: "",
        createdAt: iso(1),
        lastChangedBy: "",
        lastChangedAt: iso(1),
        serviceDefinition: "",
        versions: [],
        ...overrides
    };
}

function makeJob(overrides: Partial<Job>): Job {
    return {
        id: "job",
        status: "Completed",
        startedAt: iso(0),
        finishedAt: iso(0),
        durationMs: 42000,
        executedBy: "system",
        triggerType: "SCHEDULE",
        triggerText: "Schedule",
        totalRegistry: 1,
        changeCount: 0,
        newVersionCount: 0,
        logs: [],
        errorMessage: "",
        summary: "",
        ...overrides
    };
}

function makeLog(overrides: Partial<LogEntry>): LogEntry {
    return {
        id: "log",
        actionType: "PUBLISH",
        actionText: "Published",
        actor: "j.doe",
        actionAt: iso(0),
        ipAddress: "",
        remarks: "",
        logResult: "S",
        objectId: "obj",
        objectIdType: "REGISTRY",
        jobId: "",
        ...overrides
    };
}

// ═════════════════════════════════════════════════════════════════════════════
//  computeKpiDelta
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Home – computeKpiDelta");

QUnit.test("counts registries created within the 7-day window as totalNew", function (assert) {
    const ctrl = new Home("test") as any;
    const registries: Registry[] = [
        makeRegistry({ id: "a", createdAt: iso(1) }),
        makeRegistry({ id: "b", createdAt: iso(3) }),
        makeRegistry({ id: "c", createdAt: iso(30) })
    ];
    const delta = ctrl.computeKpiDelta(registries);
    assert.strictEqual(delta.totalNew, 2, "only the two created within 7 days count");
});

QUnit.test("counts changed-this-week per current status", function (assert) {
    const ctrl = new Home("test") as any;
    const registries: Registry[] = [
        makeRegistry({ id: "a", status: "Published", lastChangedAt: iso(2) }),
        makeRegistry({ id: "b", status: "Published", lastChangedAt: iso(20) }),
        makeRegistry({ id: "c", status: "Unpublished", lastChangedAt: iso(1) }),
        makeRegistry({ id: "d", status: "Archive", lastChangedAt: iso(4) })
    ];
    const delta = ctrl.computeKpiDelta(registries);
    assert.strictEqual(delta.publishedChanged, 1, "one published changed within 7 days");
    assert.strictEqual(delta.unpublishedChanged, 1, "one unpublished changed within 7 days");
    assert.strictEqual(delta.archiveChanged, 1, "one archived changed within 7 days");
});

QUnit.test("returns all zeros for an empty registry list", function (assert) {
    const ctrl = new Home("test") as any;
    const delta = ctrl.computeKpiDelta([]);
    assert.deepEqual(delta, { totalNew: 0, publishedChanged: 0, unpublishedChanged: 0, archiveChanged: 0 });
});

// ═════════════════════════════════════════════════════════════════════════════
//  bucketScanTrend
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Home – bucketScanTrend");

QUnit.test("always returns 14 daily buckets", function (assert) {
    const ctrl = new Home("test") as any;
    const points = ctrl.bucketScanTrend([]);
    assert.strictEqual(points.length, 14);
});

QUnit.test("last bucket is today and counts today's jobs", function (assert) {
    const ctrl = new Home("test") as any;
    const points = ctrl.bucketScanTrend([makeJob({ startedAt: iso(0) }), makeJob({ startedAt: iso(0) })]);
    assert.strictEqual(points[13].value, 2, "both of today's jobs land in the final bucket");
});

QUnit.test("ignores jobs older than 14 days", function (assert) {
    const ctrl = new Home("test") as any;
    const jobs = [makeJob({ startedAt: iso(2) }), makeJob({ startedAt: iso(13) }), makeJob({ startedAt: iso(20) })];
    const total = ctrl.bucketScanTrend(jobs).reduce((sum: number, p: { value: number }) => sum + p.value, 0);
    assert.strictEqual(total, 2, "the 20-day-old job is excluded; the 2- and 13-day-old ones count");
});

QUnit.test("skips jobs with an unparseable date", function (assert) {
    const ctrl = new Home("test") as any;
    const total = ctrl.bucketScanTrend([makeJob({ startedAt: "not-a-date" })]).reduce((s: number, p: { value: number }) => s + p.value, 0);
    assert.strictEqual(total, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
//  buildActivity
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Home – buildActivity");

QUnit.test("merges jobs and logs, newest first", function (assert) {
    const ctrl = new Home("test") as any;
    const jobs = [makeJob({ id: "job-1", startedAt: iso(1) })];
    const logs = [makeLog({ id: "log-1", objectIdType: "REGISTRY", objectId: "reg-1", actionAt: iso(0) })];
    const activity = ctrl.buildActivity(jobs, logs);
    assert.strictEqual(activity.length, 2, "both rows appear");
    assert.strictEqual(activity[0].kind, "log", "the more recent log row sorts first");
    assert.strictEqual(activity[1].kind, "job");
});

QUnit.test("de-dupes a SCANJOB log already represented by a job row", function (assert) {
    const ctrl = new Home("test") as any;
    const jobs = [makeJob({ id: "JOB-1" })];
    const logs = [
        makeLog({ id: "log-scan", objectIdType: "SCANJOB", objectId: "job-1" }),
        makeLog({ id: "log-reg", objectIdType: "REGISTRY", objectId: "reg-1" })
    ];
    const activity = ctrl.buildActivity(jobs, logs);
    assert.strictEqual(activity.length, 2, "the duplicate scan-job log is dropped (job + registry log remain)");
    assert.notOk(
        activity.some((item: { kind: string; objectIdType: string }) => item.kind === "log" && item.objectIdType === "SCANJOB"),
        "no SCANJOB log row survives"
    );
});

QUnit.test("caps the feed at 8 rows", function (assert) {
    const ctrl = new Home("test") as any;
    const logs = Array.from({ length: 12 }, (_, i) => makeLog({ id: `log-${i}`, objectId: `obj-${i}`, actionAt: iso(i) }));
    const activity = ctrl.buildActivity([], logs);
    assert.strictEqual(activity.length, 8);
});

QUnit.test("job rows carry SCANJOB type and the job id for navigation", function (assert) {
    const ctrl = new Home("test") as any;
    const activity = ctrl.buildActivity([makeJob({ id: "job-9" })], []);
    assert.strictEqual(activity[0].objectIdType, "SCANJOB");
    assert.strictEqual(activity[0].objectId, "job-9");
    assert.strictEqual(activity[0].kind, "job");
});
