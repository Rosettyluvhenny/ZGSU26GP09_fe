import type { NodeTreeResponseItem, NodeTreeViewItem } from '../model/types';

export interface XmlLineMap {
	lineStarts: number[];
}

export interface PrettyXmlResult {
	prettyXml: string;
	rawOffsets: number[];
}

function asText(value: unknown): string {
	return value === null || value === undefined ? '' : String(value);
}

function getLabelSuffix(value: string): string {
	const lastSegment = value.split('/').filter(Boolean).pop();
	return lastSegment && lastSegment.length > 0 ? lastSegment : value;
}

function formatNodeLabel(item: NodeTreeResponseItem): string {
	return `${item.nodeType}{${getLabelSuffix(item.semanticId)}}`;
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
			byId.get(item.parentId)!.children.push(node);
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
			const leftKind = Number(Boolean(left.isAttributeGroup)) + Number(Boolean(left.isAttribute));
			const rightKind = Number(Boolean(right.isAttributeGroup)) + Number(Boolean(right.isAttribute));
			return leftKind - rightKind || left.seq - right.seq || left.depth - right.depth;
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

export function applyNodeDiffStatus(nodes: NodeTreeViewItem[], statusBySemanticId: Map<string, string>): NodeTreeViewItem[] {
	return nodes.map((node) => ({
		...node,
		diffStatus: statusBySemanticId.get(node.semanticId),
		children: applyNodeDiffStatus(node.children, statusBySemanticId)
	}));
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
