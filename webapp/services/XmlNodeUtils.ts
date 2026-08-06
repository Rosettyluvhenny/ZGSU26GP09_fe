import type { NodeTreeResponseItem, NodeTreeViewItem } from '../model/types';

export interface XmlLineMap {
	lineStarts: number[];
}

export interface PrettyXmlResult {
	prettyXml: string;
	rawOffsets: number[];
}

function asText(value: unknown): string {
	if (value === null || value === undefined) return '';
	const primitive = value as string | number | boolean | bigint;
	return String(primitive);
}

function getLabelSuffix(value: string): string {
	// Split only on '/' that are outside '[...]' brackets so that a semanticId like
	// "Schema(#1)/Annotations[Target=Entities/ZC_BOOKING]" yields the full last
	// segment "Annotations[Target=Entities/ZC_BOOKING]" instead of "ZC_BOOKING]".
	const s = value ?? '';
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '[') {
			depth++;
		} else if (s[i] === ']') {
			depth--;
		} else if (s[i] === '/' && depth === 0) {
			parts.push(s.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(s.slice(start));
	const lastSegment = parts.filter(Boolean).pop();
	return lastSegment && lastSegment.length > 0 ? lastSegment : value;
}

function formatNodeLabel(item: NodeTreeResponseItem): string {
	return getLabelSuffix(item.semanticId);
}

function createAttributeNodes(item: NodeTreeResponseItem): NodeTreeViewItem[] {
	if (item.attributes.length === 0) {
		return [];
	}

	const attributeGroup: NodeTreeViewItem = {
		nodeId: `${item.nodeId}-attrs`,
		semanticId: `${item.semanticId}/@attributes`,
		parentId: item.nodeId,
		nodePath: `${item.nodePath}/@attributes`,
		nodeType: 'Attributes',
		nodeName: 'Attributes',
		nodeAlias: '',
		offsetStart: item.offsetStart,
		offsetEnd: item.offsetEnd,
		seq: item.seq,
		depth: item.depth + 1,
		attributes: [],
		label: 'Attributes',
		children: [] as NodeTreeViewItem[],
		lineStart: 0,
		lineEnd: 0,
		isAttributeGroup: true
	};

	attributeGroup.children = item.attributes.map((attribute, index) => ({
		nodeId: `${item.nodeId}-attr-${index}`,
		semanticId: `${item.semanticId}/${attribute.name}`,
		parentId: attributeGroup.nodeId,
		nodePath: `${item.nodePath}/@attributes/${index + 1}`,
		nodeType: 'Attribute',
		nodeName: attribute.name,
		nodeAlias: attribute.value,
		offsetStart: item.offsetStart,
		offsetEnd: item.offsetEnd,
		seq: index + 1,
		depth: item.depth + 2,
		attributes: [] as NodeTreeResponseItem['attributes'],
		label: `${attribute.name} = ${attribute.value}`,
		children: [] as NodeTreeViewItem[],
		lineStart: 0,
		lineEnd: 0,
		isAttribute: true
	}));

	return [attributeGroup];
}

export function prettyPrintXml(rawXml: string): PrettyXmlResult {
	const xml = asText(rawXml);
	if (!xml) {
		return { prettyXml: '', rawOffsets: [] };
	}

	const regex = /(<[^>]+>)|([^<]+)/g;
	let match;
	const lines: string[] = [];
	const rawOffsets: number[] = [];
	let indent = 0;

	while ((match = regex.exec(xml)) !== null) {
		const text = match[0].trim();
		if (!text) {
			continue;
		}

		const rawOffset = match.index;
		const isClosingTag = /^<\//.test(text);
		const isOpeningTag = /^<[^!?/][^>]*>$/.test(text) && !/\/>$/.test(text);
		const isSelfClosingTag = /\/>$/.test(text) || /^<\?/.test(text) || /^<!/.test(text);

		if (isClosingTag) {
			indent = Math.max(0, indent - 1);
		}

		lines.push(`${'\t'.repeat(indent)}${text}`);
		rawOffsets.push(rawOffset);

		if (isOpeningTag && !isSelfClosingTag) {
			indent += 1;
		}
	}

	return {
		prettyXml: lines.join('\n'),
		rawOffsets
	};
}

export function buildXmlLineMap(xml: string): XmlLineMap {
	const lineStarts: number[] = [0];
	for (let index = 0; index < xml.length; index += 1) {
		if (xml.charCodeAt(index) === 10) {
			lineStarts.push(index + 1);
		}
	}

	return { lineStarts };
}

export function offsetToLine(offset: number, lineStarts: number[]): number {
	if (lineStarts.length === 0) {
		return 1;
	}

	const normalizedOffset = Math.max(0, offset);
	let low = 0;
	let high = lineStarts.length - 1;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		if (lineStarts[mid] <= normalizedOffset) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return Math.max(1, high + 1);
}

export function buildNodeTree(items: NodeTreeResponseItem[]): NodeTreeViewItem[] {
	const byId = new Map<string, NodeTreeViewItem>();
	const roots: NodeTreeViewItem[] = [];

	for (const item of items) {
		const label = formatNodeLabel(item);
		byId.set(item.nodeId, {
			...item,
			label,
			children: [] as NodeTreeViewItem[],
			lineStart: 0,
			lineEnd: 0
		});
	}

	for (const item of items) {
		const node = byId.get(item.nodeId);
		if (!node) {
			continue;
		}

		if (item.parentId && byId.has(item.parentId)) {
			byId.get(item.parentId).children.push(node);
		} else {
			roots.push(node);
		}
	}

	for (const item of items) {
		const node = byId.get(item.nodeId);
		if (!node) {
			continue;
		}

		node.children.push(...createAttributeNodes(item));
	}

	const sortTree = (nodes: NodeTreeViewItem[]): void => {
		nodes.sort((left, right) => {
			// Attribute group / attributes first, then element children by seq.
			const leftKind = Number(Boolean(left.isAttributeGroup)) + Number(Boolean(left.isAttribute));
			const rightKind = Number(Boolean(right.isAttributeGroup)) + Number(Boolean(right.isAttribute));
			return rightKind - leftKind || left.seq - right.seq || left.depth - right.depth;
		});
		for (const node of nodes) {
			sortTree(node.children);
		}
	};

	sortTree(roots);
	return roots;
}

export function flattenNodeTree(nodes: NodeTreeViewItem[]): NodeTreeViewItem[] {
	return nodes.flatMap((node) => [node, ...flattenNodeTree(node.children)]);
}

export function filterNodeTree(nodes: NodeTreeViewItem[], predicate: (node: NodeTreeViewItem) => boolean): NodeTreeViewItem[] {
	const result: NodeTreeViewItem[] = [];
	for (const node of nodes) {
		const filteredChildren = filterNodeTree(node.children, predicate);
		if (predicate(node) || filteredChildren.length > 0) {
			result.push({ ...node, children: filteredChildren });
		}
	}
	return result;
}

export function applyNodeDiffStatus(nodes: NodeTreeViewItem[], statusBySemanticId: Map<string, string>): NodeTreeViewItem[] {
	return nodes.map((node) => ({
		...node,
		diffStatus: statusBySemanticId.get(node.semanticId),
		children: applyNodeDiffStatus(node.children, statusBySemanticId)
	}));
}

export function buildLineHighlightMap(nodes: NodeTreeViewItem[]): Map<number, string> {
	const lineHighlights = new Map<number, string>();
	const highlightedNodes = flattenNodeTree(nodes)
		.filter((node) => node.highlight && node.highlight !== 'None')
		.sort((left, right) => right.depth - left.depth);

	for (const node of highlightedNodes) {
		const start = node.lineStart || 0;
		const end = node.lineEnd || start;
		if (start <= 0) {
			continue;
		}

		for (let line = start; line <= end; line += 1) {
			if (!lineHighlights.has(line)) {
				lineHighlights.set(line, node.highlight);
			}
		}
	}

	return lineHighlights;
}

export function buildLineIndexFromXml(xml: string): number[] {
	const lineStarts: number[] = [0];
	for (let index = 0; index < xml.length; index += 1) {
		if (xml[index] === '\n') {
			lineStarts.push(index + 1);
		}
	}

	return lineStarts;
}

/**
 * Turns one line of XML into HTML with syntax-highlight spans (tag names,
 * attribute names/values, comments) for rendering in sap.m.FormattedText.
 * The input is escaped first, so the XML itself can never inject markup.
 * Lines that don't parse as a complete tag (e.g. a tag wrapped across lines)
 * fall back to plain escaped text.
 */
export function highlightXmlLine(line: string): string {
	if (!line) {
		return '';
	}

	const escaped = line
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

	// One pass, comments matched before tags so "<!--" is never parsed as a tag.
	const tokenPattern = /(&lt;!--[\s\S]*?(?:--&gt;|$))|(&lt;[!?/]?)([A-Za-z_][\w.:-]*)((?:(?!&gt;)[\s\S])*?)([?/]?&gt;)/g;

	return escaped.replace(tokenPattern, (match, comment: string | undefined, open: string, name: string, attrs: string, close: string) => {
		if (comment) {
			return `<span class="xmlTokCmt">${comment}</span>`;
		}

		const highlightedAttrs = attrs.replace(
			/([A-Za-z_][\w.:-]*)(=)(&quot;(?:(?!&quot;)[\s\S])*&quot;)/g,
			'<span class="xmlTokAttr">$1</span>$2<span class="xmlTokVal">$3</span>'
		);

		return `<span class="xmlTokPunct">${open}</span><span class="xmlTokTag">${name}</span>${highlightedAttrs}<span class="xmlTokPunct">${close}</span>`;
	});
}

// ── Line-level diff ───────────────────────────────────────────────────────────

/**
 * same carries BOTH original lines so each panel can display its own text
 * even when the two lines are semantically equal but differ in formatting
 * (e.g. attribute ordering).
 */
export type LineDiffOp =
	| { op: 'same'; baseLine: string; compareLine: string }
	| { op: 'del';  line: string }   // exists only in base
	| { op: 'ins';  line: string };  // exists only in compare

/**
 * Normalizes one XML line for LCS comparison purposes ONLY (never used for display).
 *
 * Two goals:
 *  1. Strip all leading whitespace (indentation) so the same tag matched at
 *     a different nesting depth — e.g. when a new parent element was inserted
 *     in one version — is still treated as the same line.
 *  2. Sort element attributes alphabetically so `Term="A" Path="B"` is treated
 *     as equal to `Path="B" Term="A"`.
 *
 * Non-element lines (text, comments, PIs, closing tags) are returned trimmed.
 */
export function normalizeXmlLine(line: string): string {
	const trimmed = line.trim();   // strip all leading/trailing whitespace

	if (!trimmed || !trimmed.startsWith('<')
			|| trimmed.startsWith('<!--') || trimmed.startsWith('<?') || trimmed.startsWith('<!')) {
		return trimmed;
	}
	if (trimmed.startsWith('</')) return trimmed;

	// Match opening/self-closing tag: <tagName attrBlock /?>
	const m = /^<([\w:.-]+)([\s\S]*?)\s*(\/?)>$/.exec(trimmed);
	if (!m) return trimmed;

	const [, tagName, attrBlock, selfClose] = m;

	// Parse name="value" or name='value' pairs and sort by name
	const pairs: Array<[string, string]> = [];
	const rx = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
	let am;
	while ((am = rx.exec(attrBlock)) !== null) {
		pairs.push([am[1], am[2] ?? am[3] ?? '']);
	}
	pairs.sort(([a], [b]) => a.localeCompare(b));

	const attrStr = pairs.map(([n, v]) => `${n}="${v}"`).join(' ');
	const close = selfClose ? '/>' : '>';
	return `<${tagName}${attrStr ? ' ' + attrStr : ''}${close}`;
}

/** Name/Namespace identity — rename ⇒ delete+add (match NodeTree), not mod. */
const IDENTITY_ATTRS = ['Name', 'Namespace'] as const;

function parseXmlElementLine(line: string): { kind: 'open' | 'close'; tagName: string; identity: string | null } | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('<')
			|| trimmed.startsWith('<!--') || trimmed.startsWith('<?') || trimmed.startsWith('<!')) {
		return null;
	}

	const close = /^<\/([\w:.-]+)\s*>$/.exec(trimmed);
	if (close) {
		return { kind: 'close', tagName: close[1], identity: null };
	}

	const open = /^<([\w:.-]+)([\s\S]*?)\s*\/?>$/.exec(trimmed);
	if (!open) {
		return null;
	}

	const tagName = open[1];
	const attrBlock = open[2] ?? '';
	let identity: string | null = null;
	for (const attrName of IDENTITY_ATTRS) {
		const rx = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
		const am = rx.exec(attrBlock);
		if (am) {
			identity = `${attrName}=${am[1] ?? am[2] ?? ''}`;
			break;
		}
	}

	return { kind: 'open', tagName, identity };
}

function xmlLineSimilarity(a: string, b: string): number {
	const ka = normalizeXmlLine(a);
	const kb = normalizeXmlLine(b);
	if (ka === kb) return 1;
	const tokenize = (s: string) => new Set(s.match(/\S+/g) ?? []);
	const sa = tokenize(ka);
	const sb = tokenize(kb);
	if (sa.size === 0 && sb.size === 0) return 1;
	if (sa.size === 0 || sb.size === 0) return 0;
	let common = 0;
	sa.forEach((t) => { if (sb.has(t)) common++; });
	return (2 * common) / (sa.size + sb.size);
}

/**
 * True only for attribute-only edits on the same tag + Name/Namespace.
 * Rename / tag change must stay del+ins (NodeTree DELETED+ADDED).
 *
 * When tag + identity match, always treat as mod (ignore token similarity) so a
 * multi-attribute edit cannot flip to del+ins while NodeTree still says MODIFIED.
 * Similarity is only a fallback for lines without Name/Namespace (text, <key>, …).
 */
export function canMergeAsXmlModification(baseLine: string, compareLine: string, minSimilarity = 0.5): boolean {
	const baseInfo = parseXmlElementLine(baseLine);
	const compareInfo = parseXmlElementLine(compareLine);

	if (baseInfo || compareInfo) {
		if (!baseInfo || !compareInfo) {
			return false;
		}
		if (baseInfo.kind !== compareInfo.kind || baseInfo.tagName !== compareInfo.tagName) {
			return false;
		}
		if ((baseInfo.identity ?? '') !== (compareInfo.identity ?? '')) {
			return false;
		}
		// Same element identity ⇒ attribute-only change ⇒ mod (align with NodeTree).
		if (baseInfo.identity !== null) {
			return true;
		}
	}

	return xmlLineSimilarity(baseLine, compareLine) >= minSimilarity;
}

/**
 * Computes a line-level diff between two arrays of text lines.
 *
 * Uses a forward sync with look-ahead instead of classic LCS backtrack.
 * LCS is optimal in length but, for repeated tokens like `</EntityType>`,
 * its backtrack often pairs a base closing tag with a *later* compare copy
 * (e.g. from a newly inserted entity), which makes the real closing tag look
 * inserted. Preferring the nearest forward sync point keeps local structure.
 *
 * @param keyFn  Optional normalizer applied before comparison only.
 *               Pass `normalizeXmlLine` for XML content.
 */
export function computeLineDiff(
	baseLines: string[],
	compareLines: string[],
	keyFn?: (line: string) => string
): LineDiffOp[] {
	const key = keyFn ?? ((s: string) => s);
	const baseKeys = baseLines.map(key);
	const compareKeys = compareLines.map(key);
	const m = baseKeys.length;
	const n = compareKeys.length;
	const ops: LineDiffOp[] = [];

	let i = 0;
	let j = 0;
	while (i < m && j < n) {
		if (baseKeys[i] === compareKeys[j]) {
			ops.push({ op: 'same', baseLine: baseLines[i], compareLine: compareLines[j] });
			i++;
			j++;
			continue;
		}

		// Nearest place the current base line appears later in compare, and vice versa.
		const jMatch = compareKeys.indexOf(baseKeys[i], j + 1);
		const iMatch = baseKeys.indexOf(compareKeys[j], i + 1);
		const skipCompare = jMatch === -1 ? Number.POSITIVE_INFINITY : jMatch - j;
		const skipBase = iMatch === -1 ? Number.POSITIVE_INFINITY : iMatch - i;

		if (skipCompare === Number.POSITIVE_INFINITY && skipBase === Number.POSITIVE_INFINITY) {
			// No resync — treat as a one-line replace.
			ops.push({ op: 'del', line: baseLines[i] });
			ops.push({ op: 'ins', line: compareLines[j] });
			i++;
			j++;
		} else if (skipCompare < skipBase) {
			// Insert compare lines until we hit the base line again (added block).
			while (j < jMatch) {
				ops.push({ op: 'ins', line: compareLines[j] });
				j++;
			}
		} else {
			// Delete base lines until we hit the compare line again (removed block).
			// On equal skip distance, prefer delete so reorderings stay cleaner.
			while (i < iMatch) {
				ops.push({ op: 'del', line: baseLines[i] });
				i++;
			}
		}
	}

	while (i < m) {
		ops.push({ op: 'del', line: baseLines[i] });
		i++;
	}
	while (j < n) {
		ops.push({ op: 'ins', line: compareLines[j] });
		j++;
	}

	return ops;
}
