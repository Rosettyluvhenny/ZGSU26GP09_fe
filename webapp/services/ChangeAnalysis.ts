import type { NodeDiffAttribute, NodeDiffEntry, NodeTreeViewItem } from '../model/types';

/**
 * Turns the raw node/attribute diff returned by `compareNodeTree` into a flat,
 * reviewable list of changes and a plain-language summary.
 *
 * The backend tells us *what* differs (semantic id + status + old/new attribute
 * values). This module answers the question a reviewer actually has: does the
 * change break the consumers of this service, and what changed in business terms.
 */

/** How risky a single change is for existing consumers of the contract. */
export type ChangeSeverity = 'Breaking' | 'Compatible' | 'Cosmetic';

export interface ChangeRow {
	semanticId: string;
	elementType: string;
	elementName: string;
	elementPath: string;
	/** Empty for element-level changes (added / removed elements). */
	attribute: string;
	status: string;
	oldValue: string;
	newValue: string;
	severity: ChangeSeverity;
	/** Why the severity was assigned, shown to the reviewer. */
	reason: string;
}

export interface ChangeAnalysisResult {
	rows: ChangeRow[];
	breaking: number;
	compatible: number;
	cosmetic: number;
	total: number;
	/** e.g. "2 entity types added · 1 property removed · 3 MaxLength changes" */
	headline: string;
}

/** Node types that carry documentation rather than the contract itself. */
const COSMETIC_NODE_TYPES = new Set(['annotation', 'annotations', 'reference', 'include', 'includeannotations']);

/** Attributes holding human-readable text, which can never break a consumer. */
const COSMETIC_ATTRIBUTES = new Set(['label', 'description', 'text', 'quickinfo', 'heading', 'summary', 'longdescription']);

/** Attributes whose value can be numerically narrowed (dangerous) or widened (safe). */
const NARROWING_ATTRIBUTES = new Set(['maxlength', 'precision', 'scale']);

/** Attributes consumers bind against directly — any change breaks them. */
const IDENTITY_ATTRIBUTES = new Set(['name', 'type', 'underlyingtype', 'entitytype', 'target', 'partner']);

/** Attributes that only hint at behaviour and never change the shape. */
const SAFE_ATTRIBUTES = new Set(['defaultvalue', 'unicode', 'srid', 'containstarget', 'concurrencymode']);

interface Group {
	noun: string;
	verb: string;
	count: number;
}

function lower(value: string | undefined): string {
	return (value ?? '').toLowerCase();
}

function statusVerb(status: string | undefined): string {
	switch ((status ?? '').toUpperCase()) {
		case 'ADDED':
			return 'added';
		case 'DELETED':
			return 'removed';
		default:
			return 'changed';
	}
}

/** `NavigationProperty` -> `navigation property` so summaries read like prose. */
function humanizeType(nodeType: string | undefined): string {
	const value = (nodeType ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().trim();
	return value.length > 0 ? value : 'element';
}

function plural(noun: string): string {
	if (/[^aeiou]y$/.test(noun)) {
		return `${noun.slice(0, -1)}ies`;
	}
	if (/(s|x|z|ch|sh)$/.test(noun)) {
		return `${noun}es`;
	}
	return `${noun}s`;
}

function lastSegment(semanticId: string): string {
	const segment = (semanticId ?? '').split('/').filter(Boolean).pop();
	return segment && segment.length > 0 ? segment : semanticId ?? '';
}

/** Returns new - old, or null when either side is not numeric. */
function numericDelta(oldValue: string | undefined, newValue: string | undefined): number | null {
	const before = Number(oldValue);
	const after = Number(newValue);
	if (!Number.isFinite(before) || !Number.isFinite(after)) {
		return null;
	}
	return after - before;
}

function classifyAttribute(nodeType: string, attribute: NodeDiffAttribute): { severity: ChangeSeverity; reason: string } {
	const name = lower(attribute.NAME);
	const status = (attribute.STATUS ?? '').toUpperCase();

	if (COSMETIC_NODE_TYPES.has(lower(nodeType)) || COSMETIC_ATTRIBUTES.has(name)) {
		return { severity: 'Cosmetic', reason: 'Documentation only' };
	}
	if (status === 'ADDED') {
		return { severity: 'Compatible', reason: 'Attribute added' };
	}
	if (status === 'DELETED') {
		return { severity: 'Breaking', reason: 'Attribute removed' };
	}

	if (name === 'nullable') {
		const wasMandatory = lower(attribute.OLD_VALUE) === 'false';
		const isMandatory = lower(attribute.NEW_VALUE) === 'false';
		if (wasMandatory && !isMandatory) {
			return { severity: 'Compatible', reason: 'Field became optional' };
		}
		if (!wasMandatory && isMandatory) {
			return { severity: 'Breaking', reason: 'Field became mandatory — existing payloads may be rejected' };
		}
		return { severity: 'Cosmetic', reason: 'No effective change' };
	}

	if (NARROWING_ATTRIBUTES.has(name)) {
		const delta = numericDelta(attribute.OLD_VALUE, attribute.NEW_VALUE);
		if (delta === null) {
			return { severity: 'Breaking', reason: `${attribute.NAME} changed` };
		}
		if (delta < 0) {
			return { severity: 'Breaking', reason: `${attribute.NAME} reduced — existing values may be truncated` };
		}
		if (delta > 0) {
			return { severity: 'Compatible', reason: `${attribute.NAME} increased` };
		}
		return { severity: 'Cosmetic', reason: 'No effective change' };
	}

	if (IDENTITY_ATTRIBUTES.has(name)) {
		return { severity: 'Breaking', reason: `${attribute.NAME} changed — consumers bind to this` };
	}
	if (SAFE_ATTRIBUTES.has(name)) {
		return { severity: 'Compatible', reason: `${attribute.NAME} changed` };
	}

	// Unknown attribute on a contract element: flag for review rather than assume safe.
	return { severity: 'Breaking', reason: `${attribute.NAME} changed — review required` };
}

function classifyElement(nodeType: string, status: string): { severity: ChangeSeverity; reason: string } {
	if (COSMETIC_NODE_TYPES.has(lower(nodeType))) {
		return { severity: 'Cosmetic', reason: 'Documentation only' };
	}
	switch ((status ?? '').toUpperCase()) {
		case 'ADDED':
			return { severity: 'Compatible', reason: 'New element — existing consumers unaffected' };
		case 'DELETED':
			return { severity: 'Breaking', reason: 'Element removed — consumers referencing it will fail' };
		default:
			return { severity: 'Compatible', reason: 'Element changed' };
	}
}

function indexTree(nodes: NodeTreeViewItem[] | undefined, into: Map<string, NodeTreeViewItem>): void {
	for (const node of nodes ?? []) {
		if (node.semanticId && !into.has(node.semanticId)) {
			into.set(node.semanticId, node);
		}
		indexTree(node.children, into);
	}
}

function addToGroup(groups: Map<string, Group>, noun: string, verb: string): void {
	const key = `${noun}|${verb}`;
	const existing = groups.get(key);
	if (existing) {
		existing.count += 1;
		return;
	}
	groups.set(key, { noun, verb, count: 1 });
}

function buildHeadline(groups: Map<string, Group>, total: number): string {
	if (total === 0) {
		return 'No structural differences';
	}
	return [...groups.values()]
		.sort((left, right) => right.count - left.count)
		.slice(0, 4)
		.map((group) => {
			const noun = group.count > 1 ? plural(group.noun) : group.noun;
			return group.verb ? `${group.count} ${noun} ${group.verb}` : `${group.count} ${noun}`;
		})
		.join(' · ');
}

/**
 * Flattens a node diff into reviewable rows.
 *
 * An element that was added or removed produces a single row. An element that was
 * modified produces one row per changed attribute, so the reviewer sees the actual
 * before/after values instead of having to read the XML.
 *
 * @param diff        result of `DetailService.compareNodeTree` / `compareDetail`
 * @param compareTree node tree of the newer side, used to resolve element names
 * @param baseTree    node tree of the older side, needed for removed elements
 */
export function analyzeChanges(
	diff: NodeDiffEntry[] | null | undefined,
	compareTree: NodeTreeViewItem[],
	baseTree: NodeTreeViewItem[]
): ChangeAnalysisResult {
	const rows: ChangeRow[] = [];
	const groups = new Map<string, Group>();

	// Compare side wins; the base side still carries elements that were removed.
	const nodes = new Map<string, NodeTreeViewItem>();
	indexTree(compareTree, nodes);
	indexTree(baseTree, nodes);

	for (const entry of diff ?? []) {
		const node = nodes.get(entry.SEMANTIC_ID);
		const elementType = node?.nodeType ?? 'Element';
		const elementName = node?.nodeName || lastSegment(entry.SEMANTIC_ID);
		const attributeDiffs = Array.isArray(entry.ATTRIBUTEDIFF) ? entry.ATTRIBUTEDIFF : [];
		const status = (entry.STATUS ?? '').toUpperCase();

		// A modified element is only interesting through its attributes.
		if (status === 'MODIFIED' && attributeDiffs.length > 0) {
			for (const attribute of attributeDiffs) {
				const { severity, reason } = classifyAttribute(elementType, attribute);
				rows.push({
					semanticId: entry.SEMANTIC_ID,
					elementType,
					elementName,
					elementPath: entry.SEMANTIC_ID,
					attribute: attribute.NAME ?? '',
					status: attribute.STATUS ?? 'MODIFIED',
					oldValue: attribute.OLD_VALUE ?? '',
					newValue: attribute.NEW_VALUE ?? '',
					severity,
					reason
				});
				addToGroup(groups, `${attribute.NAME || 'attribute'} change`, '');
			}
			continue;
		}

		const { severity, reason } = classifyElement(elementType, status);
		rows.push({
			semanticId: entry.SEMANTIC_ID,
			elementType,
			elementName,
			elementPath: entry.SEMANTIC_ID,
			attribute: '',
			status: status || 'MODIFIED',
			oldValue: '',
			newValue: '',
			severity,
			reason
		});
		addToGroup(groups, humanizeType(elementType), statusVerb(status));
	}

	// Riskiest first — that is the order a reviewer wants to work through.
	const weight: Record<ChangeSeverity, number> = { Breaking: 0, Compatible: 1, Cosmetic: 2 };
	rows.sort((left, right) => weight[left.severity] - weight[right.severity] || left.elementName.localeCompare(right.elementName));

	return {
		rows,
		breaking: rows.filter((row) => row.severity === 'Breaking').length,
		compatible: rows.filter((row) => row.severity === 'Compatible').length,
		cosmetic: rows.filter((row) => row.severity === 'Cosmetic').length,
		total: rows.length,
		headline: buildHeadline(groups, rows.length)
	};
}
