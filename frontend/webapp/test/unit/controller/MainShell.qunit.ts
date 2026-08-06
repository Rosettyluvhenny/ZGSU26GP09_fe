/**
 * QUnit tests for MainShell controller
 */
import MainShell from "com/zgp9/fe/controller/MainShell.controller";
import Theming from "sap/ui/core/Theming";

const LIGHT_THEME = "sap_horizon";
const DARK_THEME = "sap_horizon_dark";

let sandbox: any;

function buildFclMock() {
    return {
        getId: sinon.stub().returns("shellFcl"),
        getMetadata: sinon.stub().returns({ getName: sinon.stub().returns("sap.f.FlexibleColumnLayout") }),
        isA: sinon.stub().returns(true)
    } as any;
}

interface ShellFixture {
    ctrl: MainShell;
    uiModelData: Record<string, any>;
    sessionModelStub: any;
    navToStub: any;
    themingStub: any;
}

function buildShellFixture(isDarkTheme = false): ShellFixture {
    const ctrl = new MainShell("test");
    const uiModelData: Record<string, any> = {
        "/isDarkTheme": isDarkTheme,
        "/currentSection": "home",
        "/canExecuteScanJob": true,
        "/sideNavVisible": true
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
    sandbox.stub(ctrl, "redirectToLogout");

    return { ctrl, uiModelData, sessionModelStub, navToStub, themingStub };
}

QUnit.module("MainShell – navigation", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("sets section and navigates when FCL is ready", function (assert) {
    const cases: Array<[keyof MainShell, string, string]> = [
        ["onNavigateHome", "home", "home"],
        ["onNavigateRegistries", "registries", "registryList"],
        ["onNavigateJobs", "jobs", "jobList"],
        ["onNavigateLogs", "logs", "logs"]
    ];

    cases.forEach(([method, section, route]) => {
        const { ctrl, uiModelData, navToStub } = buildShellFixture();
        (ctrl.byId as any).returns(buildFclMock());
        (ctrl[method] as () => void)();
        assert.strictEqual(uiModelData["/currentSection"], section, method);
        assert.ok(navToStub.calledWith(route, {}, true), `${method} → ${route}`);
        sandbox.restore();
        sandbox = (sinon as any).sandbox.create();
    });
});

QUnit.module("MainShell – onToggleTheme", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("toggles between light and dark themes", function (assert) {
    const light = buildShellFixture(false);
    light.ctrl.onToggleTheme();
    assert.strictEqual(light.uiModelData["/isDarkTheme"], true);
    assert.ok(light.themingStub.calledOnceWith(DARK_THEME));

    sandbox.restore();
    sandbox = (sinon as any).sandbox.create();

    const dark = buildShellFixture(true);
    dark.ctrl.onToggleTheme();
    assert.strictEqual(dark.uiModelData["/isDarkTheme"], false);
    assert.ok(dark.themingStub.calledOnceWith(LIGHT_THEME));
});

QUnit.module("MainShell – onLogout", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("clears session, disables scan, and redirects to central logout", function (assert) {
    const { ctrl, sessionModelStub, uiModelData } = buildShellFixture();
    ctrl.onLogout();

    const sessionData = sessionModelStub.setData.firstCall.args[0];
    assert.strictEqual(sessionData.userName, "");
    assert.strictEqual(sessionData.csrfToken, "");
    assert.strictEqual(sessionData.loginAt, null);
    assert.strictEqual(uiModelData["/canExecuteScanJob"], false);
    assert.ok((ctrl as any).redirectToLogout.calledOnce);
});
