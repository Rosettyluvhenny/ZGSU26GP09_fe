/**
 * QUnit tests for MainShell controller
 * SAP UI5 flat-module form + sinon.sandbox pattern (sinon 1.x/4.x compatible).
 */

import MainShell from "com/zgp9/fe/controller/MainShell.controller";
import Theming from "sap/ui/core/Theming";

// sinon: typed via webapp/test/sinon-global.d.ts (uses @types/sinon)

const LIGHT_THEME = "sap_horizon";
const DARK_THEME  = "sap_horizon_dark";

let sandbox: any;

/** Minimal FCL control mock that satisfies flushPendingNavigation() */
function buildFclMock() {
    return {
        getId:       sinon.stub().returns("shellFcl"),
        getMetadata: sinon.stub().returns({ getName: sinon.stub().returns("sap.f.FlexibleColumnLayout") }),
        isA:         sinon.stub().returns(true)
    } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fixture builder
// ─────────────────────────────────────────────────────────────────────────────
interface ShellFixture {
    ctrl: MainShell;
    uiModelData: Record<string, any>;
    uiModelStub: any;
    sessionModelStub: any;
    navToStub: any;
    themingStub: any;
}

function buildShellFixture(isDarkTheme = false): ShellFixture {
    const ctrl = new MainShell("test");

    const uiModelData: Record<string, any> = {
        "/isDarkTheme": isDarkTheme,
        "/currentSection": "home",
        "/canExecuteScanJob": true
    };
    const uiModelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { uiModelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => uiModelData[p])
    };

    const sessionModelStub = {
        setData: sinon.stub(),
        getData: sinon.stub().returns({ authenticated: true })
    };
    const navToStub = sinon.stub();
    const themingStub = sandbox.stub(Theming, "setTheme");

    sandbox.stub(ctrl, "getUiModel").returns(uiModelStub as any);
    sandbox.stub(ctrl, "getSessionModel").returns(sessionModelStub as any);
    sandbox.stub(ctrl, "navTo").callsFake(navToStub);
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getRegistryService: () => ({ getPermissions: sinon.stub().resolves([]) })
    } as any);
    sandbox.stub(ctrl, "getRouter").returns({
        navTo: navToStub,
        attachRouteMatched: sinon.stub()
    } as any);
    sandbox.stub(ctrl, "byId").returns(undefined as any);

    return { ctrl, uiModelData, uiModelStub, sessionModelStub, navToStub, themingStub };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Navigation methods
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("MainShell – navigation", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("onNavigateHome sets currentSection to 'home'", function (assert) {
    const { ctrl, uiModelData } = buildShellFixture();
    ctrl.onNavigateHome();
    assert.strictEqual(uiModelData["/currentSection"], "home");
});
QUnit.test("onNavigateRegistries sets currentSection to 'registries'", function (assert) {
    const { ctrl, uiModelData } = buildShellFixture();
    ctrl.onNavigateRegistries();
    assert.strictEqual(uiModelData["/currentSection"], "registries");
});
QUnit.test("onNavigateJobs sets currentSection to 'jobs'", function (assert) {
    const { ctrl, uiModelData } = buildShellFixture();
    ctrl.onNavigateJobs();
    assert.strictEqual(uiModelData["/currentSection"], "jobs");
});
QUnit.test("onNavigateLogs sets currentSection to 'logs'", function (assert) {
    const { ctrl, uiModelData } = buildShellFixture();
    ctrl.onNavigateLogs();
    assert.strictEqual(uiModelData["/currentSection"], "logs");
});
QUnit.test("onNavigateHome calls navTo with 'home' when FCL is ready", function (assert) {
    const { ctrl, navToStub } = buildShellFixture();
    (ctrl.byId as any).returns(buildFclMock());
    ctrl.onNavigateHome();
    assert.ok(navToStub.calledWith("home", {}, true), "Must call navTo('home', {}, true)");
});
QUnit.test("onNavigateRegistries calls navTo with 'registryList' when FCL is ready", function (assert) {
    const { ctrl, navToStub } = buildShellFixture();
    (ctrl.byId as any).returns(buildFclMock());
    ctrl.onNavigateRegistries();
    assert.ok(navToStub.calledWith("registryList", {}, true));
});
QUnit.test("onNavigateJobs calls navTo with 'jobList' when FCL is ready", function (assert) {
    const { ctrl, navToStub } = buildShellFixture();
    (ctrl.byId as any).returns(buildFclMock());
    ctrl.onNavigateJobs();
    assert.ok(navToStub.calledWith("jobList", {}, true));
});
QUnit.test("onNavigateLogs calls navTo with 'logs' when FCL is ready", function (assert) {
    const { ctrl, navToStub } = buildShellFixture();
    (ctrl.byId as any).returns(buildFclMock());
    ctrl.onNavigateLogs();
    assert.ok(navToStub.calledWith("logs", {}, true));
});

// ═════════════════════════════════════════════════════════════════════════════
//  onToggleTheme
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("MainShell – onToggleTheme", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("switches from light to dark (isDarkTheme false → true)", function (assert) {
    const { ctrl, uiModelData, themingStub } = buildShellFixture(false);
    ctrl.onToggleTheme();
    assert.strictEqual(uiModelData["/isDarkTheme"], true, "isDarkTheme must be true after toggling from light");
    assert.ok(themingStub.calledOnceWith(DARK_THEME), `Theming.setTheme must be called with '${DARK_THEME}'`);
});
QUnit.test("switches from dark to light (isDarkTheme true → false)", function (assert) {
    const { ctrl, uiModelData, themingStub } = buildShellFixture(true);
    ctrl.onToggleTheme();
    assert.strictEqual(uiModelData["/isDarkTheme"], false, "isDarkTheme must be false after toggling from dark");
    assert.ok(themingStub.calledOnceWith(LIGHT_THEME), `Theming.setTheme must be called with '${LIGHT_THEME}'`);
});
QUnit.test("double-toggle returns to original theme", function (assert) {
    const { ctrl, uiModelData } = buildShellFixture(false);
    ctrl.onToggleTheme();
    ctrl.onToggleTheme();
    assert.strictEqual(uiModelData["/isDarkTheme"], false, "isDarkTheme must return to original value");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onLogout
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("MainShell – onLogout", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("resets session model to unauthenticated state", function (assert) {
    const { ctrl, sessionModelStub } = buildShellFixture();
    ctrl.onLogout();
    assert.ok(sessionModelStub.setData.calledOnce, "sessionModel.setData must be called");
    const sessionData = sessionModelStub.setData.firstCall.args[0];
    assert.strictEqual(sessionData.userName, "", "userName must be cleared");
    assert.strictEqual(sessionData.csrfToken, "", "csrfToken must be cleared");
    assert.strictEqual(sessionData.loginAt, null, "loginAt must be null");
});
QUnit.test("sets canExecuteScanJob to false", function (assert) {
    const { ctrl, uiModelData } = buildShellFixture();
    ctrl.onLogout();
    assert.strictEqual(uiModelData["/canExecuteScanJob"], false);
});
