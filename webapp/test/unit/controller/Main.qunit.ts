/**
 * QUnit tests for Main controller
 * SAP UI5 flat-module form + sinon.sandbox pattern (sinon 1.x/4.x compatible).
 */

import Main from "com/zgp9/fe/controller/Main.controller";
import MessageBox from "sap/m/MessageBox";

// sinon: typed via webapp/test/sinon-global.d.ts (uses @types/sinon)

let sandbox: any;

QUnit.module("Main – sayHello", {
    beforeEach() { sandbox = (sinon as any).sandbox.create(); },
    afterEach() { sandbox.restore(); }
});

QUnit.test("sayHello is a function on the prototype", function (assert) {
    assert.strictEqual(typeof Main.prototype.sayHello, "function");
});
QUnit.test("sayHello calls MessageBox.show", function (assert) {
    const showStub = sandbox.stub(MessageBox, "show");
    const ctrl = new Main("test");
    ctrl.sayHello();
    assert.ok(showStub.calledOnce, "MessageBox.show must be called once");
});
QUnit.test("sayHello calls MessageBox.show with 'Hello World!'", function (assert) {
    const showStub = sandbox.stub(MessageBox, "show");
    const ctrl = new Main("test");
    ctrl.sayHello();
    assert.strictEqual(showStub.firstCall.args[0], "Hello World!", "Must show 'Hello World!'");
});
QUnit.test("sayHello does not throw", function (assert) {
    sandbox.stub(MessageBox, "show");
    const ctrl = new Main("test");
    assert.ok(() => ctrl.sayHello(), "sayHello must not throw an exception");
});
