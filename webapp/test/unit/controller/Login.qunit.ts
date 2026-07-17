/**
 * QUnit tests for Login controller
 * SAP UI5 flat-module form + sinon.sandbox pattern (sinon 1.x/4.x compatible).
 */

import Login from "com/zgp9/fe/controller/Login.controller";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";

// sinon: typed via webapp/test/sinon-global.d.ts (uses @types/sinon)

let sandbox: any;

// ─────────────────────────────────────────────────────────────────────────────
//  Test-fixture builder
// ─────────────────────────────────────────────────────────────────────────────
interface LoginFixture {
    ctrl: Login;
    loginModelData: { userName: string; password: string };
    loginModelStub: any;
    uiModelData: Record<string, any>;
    uiModelStub: any;
    sessionModelStub: any;
    authService: any;
    navToStub: any;
}

function buildLoginFixture(overrides: { userName?: string; password?: string } = {}): LoginFixture {
    const ctrl = new Login("test");

    const loginModelData = {
        userName: overrides.userName !== undefined ? overrides.userName : "",
        password: overrides.password !== undefined ? overrides.password : ""
    };
    const loginModelStub = {
        getData: sinon.stub().callsFake(() => ({ ...loginModelData })),
        setData: sinon.stub().callsFake((d: any) => Object.assign(loginModelData, d))
    };

    const uiModelData: Record<string, any> = {};
    const uiModelStub = {
        setProperty: sinon.stub().callsFake((p: string, v: any) => { uiModelData[p] = v; }),
        getProperty: sinon.stub().callsFake((p: string) => uiModelData[p])
    };

    const sessionModelStub = { setData: sinon.stub() };
    const authService = { login: sinon.stub() };
    const navToStub = sinon.stub();

    sandbox.stub(ctrl, "getModel").callsFake((name?: string) =>
        name === "login" ? (loginModelStub as any) : (null as any)
    );
    sandbox.stub(ctrl, "getUiModel").returns(uiModelStub as any);
    sandbox.stub(ctrl, "getSessionModel").returns(sessionModelStub as any);
    sandbox.stub(ctrl, "getRouter").returns({ navTo: navToStub } as any);
    sandbox.stub(ctrl, "handleServiceError").resolves();
    sandbox.stub(ctrl, "getOwnerComponent").returns({
        getAuthenticationService: () => authService
    } as any);

    return { ctrl, loginModelData, loginModelStub, uiModelData, uiModelStub, sessionModelStub, authService, navToStub };
}

// ═════════════════════════════════════════════════════════════════════════════
//  onInit
// ═════════════════════════════════════════════════════════════════════════════
let onInitCtrl: Login;
let onInitSetModelSpy: any;

QUnit.module("Login – onInit", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        onInitCtrl = new Login("test");
        onInitSetModelSpy = sandbox.stub(onInitCtrl, "setModel").returns(onInitCtrl);
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("calls setModel once", function (assert) {
    onInitCtrl.onInit();
    assert.ok(onInitSetModelSpy.calledOnce, "setModel must be called exactly once");
});
QUnit.test("registers model under the name 'login'", function (assert) {
    onInitCtrl.onInit();
    assert.strictEqual(onInitSetModelSpy.firstCall.args[1], "login", "Model name must be 'login'");
});
QUnit.test("initial model data has empty userName", function (assert) {
    onInitCtrl.onInit();
    const model = onInitSetModelSpy.firstCall.args[0];
    assert.strictEqual(model.getData().userName, "", "userName must be empty");
});
QUnit.test("initial model data has empty password", function (assert) {
    onInitCtrl.onInit();
    const model = onInitSetModelSpy.firstCall.args[0];
    assert.strictEqual(model.getData().password, "", "password must be empty");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onLogin – input validation
// ═════════════════════════════════════════════════════════════════════════════
let validationMsgBoxErrorStub: any;

QUnit.module("Login – onLogin – validation", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        validationMsgBoxErrorStub = sandbox.stub(MessageBox, "error" as any);
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("shows error when userName is empty", async function (assert) {
    const { ctrl } = buildLoginFixture({ userName: "", password: "secret" });
    await ctrl.onLogin();
    assert.ok(validationMsgBoxErrorStub.calledOnce, "MessageBox.error must be called");
    assert.ok(validationMsgBoxErrorStub.firstCall.args[0].includes("required"), "Error message mentions 'required'");
});
QUnit.test("shows error when password is empty", async function (assert) {
    const { ctrl } = buildLoginFixture({ userName: "admin", password: "" });
    await ctrl.onLogin();
    assert.ok(validationMsgBoxErrorStub.calledOnce, "MessageBox.error must be called");
});
QUnit.test("shows error when userName is whitespace-only", async function (assert) {
    const { ctrl } = buildLoginFixture({ userName: "   ", password: "secret" });
    await ctrl.onLogin();
    assert.ok(validationMsgBoxErrorStub.calledOnce, "MessageBox.error must be called");
});
QUnit.test("shows error when password is whitespace-only", async function (assert) {
    const { ctrl } = buildLoginFixture({ userName: "admin", password: "   " });
    await ctrl.onLogin();
    assert.ok(validationMsgBoxErrorStub.calledOnce, "MessageBox.error must be called");
});
QUnit.test("does NOT call auth service when credentials are invalid", async function (assert) {
    const { ctrl, authService } = buildLoginFixture({ userName: "", password: "" });
    await ctrl.onLogin();
    assert.ok(!authService.login.called, "auth.login must NOT be called with invalid credentials");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onLogin – success
// ═════════════════════════════════════════════════════════════════════════════
const SESSION_DATA = { authenticated: true, userName: "alice", csrfToken: "tok", loginAt: "2024-01-01" };
let successMsgToastStub: any;

QUnit.module("Login – onLogin – success flow", {
    beforeEach() {
        sandbox = (sinon as any).sandbox.create();
        successMsgToastStub = sandbox.stub(MessageToast, "show");
    },
    afterEach() { sandbox.restore(); }
});

QUnit.test("calls auth.login with trimmed credentials", async function (assert) {
    const { ctrl, authService } = buildLoginFixture({ userName: " alice ", password: "pass" });
    authService.login.resolves(SESSION_DATA);
    await ctrl.onLogin();
    assert.ok(authService.login.calledOnce, "auth.login must be called once");
    assert.strictEqual(authService.login.firstCall.args[0], "alice", "Username must be trimmed");
    assert.strictEqual(authService.login.firstCall.args[1], "pass", "Password is passed as-is");
});
QUnit.test("stores session data in sessionModel on success", async function (assert) {
    const { ctrl, authService, sessionModelStub } = buildLoginFixture({ userName: "alice", password: "pass" });
    authService.login.resolves(SESSION_DATA);
    await ctrl.onLogin();
    assert.ok(sessionModelStub.setData.calledOnceWith(SESSION_DATA), "Session data must be stored");
});
QUnit.test("shows MessageToast with welcome message on success", async function (assert) {
    const { ctrl, authService } = buildLoginFixture({ userName: "alice", password: "pass" });
    authService.login.resolves(SESSION_DATA);
    await ctrl.onLogin();
    assert.ok(successMsgToastStub.calledOnce, "MessageToast.show must be called");
    assert.ok(successMsgToastStub.firstCall.args[0].includes("alice"), "Toast must include user name");
});
QUnit.test("navigates to 'home' on success", async function (assert) {
    const { ctrl, authService, navToStub } = buildLoginFixture({ userName: "alice", password: "pass" });
    authService.login.resolves(SESSION_DATA);
    await ctrl.onLogin();
    assert.ok(navToStub.calledOnce, "navTo must be called");
    assert.strictEqual(navToStub.firstCall.args[0], "home", "Must navigate to 'home'");
});
QUnit.test("clears login model data after success", async function (assert) {
    const { ctrl, authService, loginModelStub } = buildLoginFixture({ userName: "alice", password: "pass" });
    authService.login.resolves(SESSION_DATA);
    await ctrl.onLogin();
    assert.ok(loginModelStub.setData.calledOnce, "loginModel.setData must be called to reset fields");
    const resetData = loginModelStub.setData.firstCall.args[0];
    assert.strictEqual(resetData.userName, "", "userName must be cleared");
    assert.strictEqual(resetData.password, "", "password must be cleared");
});
QUnit.test("sets loginBusy=false in finally after success", async function (assert) {
    const { ctrl, authService, uiModelData } = buildLoginFixture({ userName: "alice", password: "pass" });
    authService.login.resolves(SESSION_DATA);
    await ctrl.onLogin();
    assert.strictEqual(uiModelData["/loginBusy"], false, "loginBusy must be false after completion");
});

// ═════════════════════════════════════════════════════════════════════════════
//  onLogin – error
// ═════════════════════════════════════════════════════════════════════════════
QUnit.module("Login – onLogin – error handling", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("calls handleServiceError when auth.login rejects", async function (assert) {
    const { ctrl, authService } = buildLoginFixture({ userName: "alice", password: "pass" });
    const serviceError = new Error("Unauthorized");
    authService.login.rejects(serviceError);
    await ctrl.onLogin();
    assert.ok((ctrl.handleServiceError as any).calledOnceWith(serviceError), "handleServiceError must be called with the error");
});
QUnit.test("resets loginBusy to false even when an error occurs", async function (assert) {
    const { ctrl, authService, uiModelData } = buildLoginFixture({ userName: "alice", password: "pass" });
    authService.login.rejects(new Error("Network error"));
    await ctrl.onLogin();
    assert.strictEqual(uiModelData["/loginBusy"], false, "loginBusy must be false in the finally block");
});
QUnit.test("does NOT navigate when auth.login rejects", async function (assert) {
    const { ctrl, authService, navToStub } = buildLoginFixture({ userName: "alice", password: "pass" });
    authService.login.rejects(new Error("Unauthorized"));
    await ctrl.onLogin();
    assert.ok(!navToStub.called, "navTo must NOT be called on error");
});
