/**
 * QUnit tests for ODataParsers mappers used by Logs / Jobs.
 */

import { mapLogEntity, mapJobEntity, normalizeODataCollection, normalizeODataEntity } from "com/zgp9/fe/services/ODataParsers";

QUnit.module("ODataParsers – normalizeODataCollection");

QUnit.test("reads value array from OData V4 payload", function (assert) {
    const rows = normalizeODataCollection({ value: [{ a: 1 }, { a: 2 }] });
    assert.strictEqual(rows.length, 2);
});

QUnit.test("returns empty array for null/undefined payload", function (assert) {
    assert.deepEqual(normalizeODataCollection(null), []);
    assert.deepEqual(normalizeODataCollection(undefined), []);
});

QUnit.module("ODataParsers – normalizeODataEntity");

QUnit.test("unwraps d results when present", function (assert) {
    const entity = normalizeODataEntity({ d: { Name: "x" } });
    assert.strictEqual(entity.Name, "x");
});

QUnit.test("returns empty object for non-object payload", function (assert) {
    assert.deepEqual(normalizeODataEntity("oops"), {});
});

QUnit.module("ODataParsers – mapLogEntity");

QUnit.test("maps ActionText when present", function (assert) {
    const log = mapLogEntity({
        LogId: "11111111-1111-1111-1111-111111111111",
        ActionType: "C",
        ActionText: "Create",
        Actor: "DEV-1",
        ActionAt: "/Date(1700000000000)/",
        IpAddress: "127.0.0.1",
        Remarks: "ok",
        LogResult: "SUCCESS",
        ObjectId: "22222222-2222-2222-2222-222222222222",
        objectIdType: "REGISTRY",
        JobId: "33333333-3333-3333-3333-333333333333"
    });
    assert.strictEqual(log.actionType, "C");
    assert.strictEqual(log.actionText, "Create");
    assert.strictEqual(log.actor, "DEV-1");
    assert.strictEqual(log.logResult, "SUCCESS");
    assert.strictEqual(log.objectIdType, "REGISTRY");
    assert.strictEqual(log.jobId, "33333333-3333-3333-3333-333333333333");
});

QUnit.test("falls back to ActionType when ActionText is missing", function (assert) {
    const log = mapLogEntity({
        LogId: "11111111-1111-1111-1111-111111111111",
        ActionType: "UP",
        Actor: "DEV-1",
        LogResult: "FAIL",
        objectIdType: "DETAIL"
    });
    assert.strictEqual(log.actionText, "UP");
});

QUnit.module("ODataParsers – mapJobEntity");

QUnit.test("maps ScanJobId and TriggerText", function (assert) {
    const job = mapJobEntity({
        ScanJobId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        Status: "S",
        StatusText: "Completed",
        StartedAt: "2024-01-01T08:00:00Z",
        FinishedAt: "2024-01-01T08:01:00Z",
        TriggeredBy: "system",
        TriggerType: "S",
        TriggerText: "Schedule",
        TotalRegistry: 3,
        ChangeCount: 1,
        NewVersionCount: 1
    });
    assert.strictEqual(job.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    assert.strictEqual(job.triggerText, "Schedule");
    assert.strictEqual(job.totalRegistry, 3);
    assert.ok(job.durationMs !== null && job.durationMs > 0, "durationMs computed from start/finish");
});
