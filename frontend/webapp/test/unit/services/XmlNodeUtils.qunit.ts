/**
 * QUnit tests for XmlNodeUtils pure helpers (normalize + line diff).
 */

import {
    normalizeXmlLine,
    computeLineDiff,
    offsetToLine,
    flattenNodeTree,
    filterNodeTree
} from "com/zgp9/fe/services/XmlNodeUtils";

QUnit.module("XmlNodeUtils – normalizeXmlLine");

QUnit.test("trims whitespace on plain text lines", function (assert) {
    assert.strictEqual(normalizeXmlLine("  hello  "), "hello");
});

QUnit.test("sorts attributes alphabetically so order does not affect equality", function (assert) {
    const a = normalizeXmlLine('<EntityType Term="A" Path="B">');
    const b = normalizeXmlLine('<EntityType Path="B" Term="A">');
    assert.strictEqual(a, b);
    assert.strictEqual(a, '<EntityType Path="B" Term="A">');
});

QUnit.test("leaves closing tags unchanged (aside from trim)", function (assert) {
    assert.strictEqual(normalizeXmlLine("  </EntityType>  "), "</EntityType>");
});

QUnit.test("leaves comments unchanged after trim", function (assert) {
    assert.strictEqual(normalizeXmlLine("  <!-- note -->  "), "<!-- note -->");
});

QUnit.module("XmlNodeUtils – computeLineDiff");

QUnit.test("marks identical lines as same", function (assert) {
    const ops = computeLineDiff(["a", "b"], ["a", "b"]);
    assert.deepEqual(ops.map((o) => o.op), ["same", "same"]);
});

QUnit.test("detects a deleted line", function (assert) {
    const ops = computeLineDiff(["a", "b", "c"], ["a", "c"]);
    assert.ok(ops.some((o) => o.op === "del" && (o as { line: string }).line === "b"));
});

QUnit.test("detects an inserted line", function (assert) {
    const ops = computeLineDiff(["a", "c"], ["a", "b", "c"]);
    assert.ok(ops.some((o) => o.op === "ins" && (o as { line: string }).line === "b"));
});

QUnit.test("uses keyFn so attribute order does not create a false diff", function (assert) {
    const base = ['<EntityType Term="A" Path="B">'];
    const compare = ['<EntityType Path="B" Term="A">'];
    const ops = computeLineDiff(base, compare, normalizeXmlLine);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].op, "same");
});

QUnit.test("prefers nearest forward sync for repeated closing tags", function (assert) {
    // Classic LCS can mis-pair </EntityType>; look-ahead sync should keep local structure.
    const base = ["<A>", "</EntityType>", "<B>", "</EntityType>"];
    const compare = ["<A>", "</EntityType>", "<NEW>", "</NEW>", "<B>", "</EntityType>"];
    const ops = computeLineDiff(base, compare);
    const firstClose = ops.find((o) => o.op === "same" && (o as { baseLine: string }).baseLine === "</EntityType>");
    assert.ok(firstClose, "first </EntityType> should still align as same");
});

QUnit.module("XmlNodeUtils – offsetToLine");

QUnit.test("maps offset 0 to line 1", function (assert) {
    assert.strictEqual(offsetToLine(0, [0, 10, 20]), 1);
});

QUnit.test("maps offset inside second line to line 2", function (assert) {
    assert.strictEqual(offsetToLine(15, [0, 10, 20]), 2);
});

QUnit.module("XmlNodeUtils – tree helpers");

QUnit.test("flattenNodeTree walks children depth-first", function (assert) {
    const tree = [
        {
            nodeId: "1",
            nodeName: "root",
            semanticId: "r",
            children: [{ nodeId: "2", nodeName: "child", semanticId: "c", children: [] }]
        }
    ] as any;
    const flat = flattenNodeTree(tree);
    assert.strictEqual(flat.length, 2);
    assert.strictEqual(flat[0].nodeId, "1");
    assert.strictEqual(flat[1].nodeId, "2");
});

QUnit.test("filterNodeTree keeps matching nodes and ancestors", function (assert) {
    const tree = [
        {
            nodeId: "1",
            nodeName: "root",
            name: "root",
            semanticId: "r",
            children: [
                { nodeId: "2", nodeName: "keep-me", name: "keep-me", semanticId: "c", children: [] },
                { nodeId: "3", nodeName: "drop", name: "drop", semanticId: "d", children: [] }
            ]
        }
    ] as any;
    const filtered = filterNodeTree(tree, (n: any) => String(n.name || n.nodeName).includes("keep"));
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].children?.length, 1);
    assert.strictEqual((filtered[0].children?.[0] as any).name || filtered[0].children?.[0].nodeName, "keep-me");
});
