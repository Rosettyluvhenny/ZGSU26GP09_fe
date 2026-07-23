/**
 * QUnit tests for RegistryDetail controller (selection + compare navigation).
 */

import RegistryDetail from "com/zgp9/fe/controller/RegistryDetail.controller";
import type { RegistryVersion } from "com/zgp9/fe/model/types";

let sandbox: any;

const VERSIONS: RegistryVersion[] = [
    {
        id: "v-old",
        groupId: "reg-1",
        versionNumber: "001",
        createdBy: "alice",
        createdAt: "2024-01-01T00:00:00.000Z",
        comment: "",
        metadata: { entityTypes: [], entitySets: [], properties: [], navigationProperties: [], functionImports: [], actions: [], complexTypes: [] },
        xml: ""
    },
    {
        id: "v-new",
        groupId: "reg-1",
        versionNumber: "002",
        createdBy: "bob",
        createdAt: "2024-06-01T00:00:00.000Z",
        comment: "",
        metadata: { entityTypes: [], entitySets: [], properties: [], navigationProperties: [], functionImports: [], actions: [], complexTypes: [] },
        xml: ""
    }
];

interface Fixture {
    ctrl: RegistryDetail;
    modelData: Record<string, any>;
    navToStub: any;
}

function buildFixture(): Fixture {
    const ctrl = new RegistryDetail("test");
    const modelData: Record<string, any> = {
        "/versions": VERSIONS,
        "/selectedVersionIds": [],
        "/selectionCountLabel": "0/2",
        "/canCompare": false,
        "/busy": false
    };
    const modelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { modelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => modelData[p]),
        setData: sinon.stub()
    };
    const navToStub = sinon.stub();

    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "registryDetail" ? (modelStub as any) : null
    );
    sandbox.stub(ctrl, "getRouter").returns({
        getRoute: sinon.stub().returns({ attachPatternMatched: sinon.stub() }),
        navTo: navToStub
    } as any);
    sandbox.stub(ctrl, "navTo").callsFake(navToStub);
    sandbox.stub(ctrl, "handleServiceError").resolves();
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getRegistryService: () => ({ getRegistry: sinon.stub().resolves({ id: "reg-1" }) }),
        getVersionService: () => ({ getVersions: sinon.stub().resolves(VERSIONS) })
    } as any);

    (ctrl as any).registryId = "reg-1";
    return { ctrl, modelData, navToStub };
}

QUnit.module("RegistryDetail – onComparePress", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("navigates to versionCompare with older version as Base (left)", function (assert) {
    const { ctrl, modelData, navToStub } = buildFixture();
    // Intentionally select newer first — sort must still put older on the left.
    modelData["/selectedVersionIds"] = ["v-new", "v-old"];
    ctrl.onComparePress();
    assert.ok(navToStub.calledOnce);
    assert.strictEqual(navToStub.firstCall.args[0], "versionCompare");
    assert.deepEqual(navToStub.firstCall.args[1], {
        registryId: "reg-1",
        leftVersionId: "v-old",
        rightVersionId: "v-new"
    });
});

QUnit.test("does NOT navigate when fewer than 2 versions are selected", function (assert) {
    const { ctrl, modelData, navToStub } = buildFixture();
    modelData["/selectedVersionIds"] = ["v-old"];
    ctrl.onComparePress();
    assert.ok(!navToStub.called);
});

QUnit.test("does NOT navigate when registryId is missing", function (assert) {
    const { ctrl, modelData, navToStub } = buildFixture();
    (ctrl as any).registryId = null;
    modelData["/selectedVersionIds"] = ["v-old", "v-new"];
    ctrl.onComparePress();
    assert.ok(!navToStub.called);
});

QUnit.module("RegistryDetail – onVersionPress", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("navigates to versionDetail with registryId and versionId", function (assert) {
    const { ctrl, navToStub } = buildFixture();
    const event = {
        getSource: sinon.stub().returns({
            getBindingContext: sinon.stub().returns({ getObject: () => VERSIONS[1] })
        })
    } as any;
    ctrl.onVersionPress(event);
    assert.ok(navToStub.calledOnce);
    assert.strictEqual(navToStub.firstCall.args[0], "versionDetail");
    assert.deepEqual(navToStub.firstCall.args[1], { registryId: "reg-1", versionId: "v-new" });
});

QUnit.test("does NOT navigate when binding context is null", function (assert) {
    const { ctrl, navToStub } = buildFixture();
    const event = {
        getSource: sinon.stub().returns({
            getBindingContext: sinon.stub().returns(null)
        })
    } as any;
    ctrl.onVersionPress(event);
    assert.ok(!navToStub.called);
});
