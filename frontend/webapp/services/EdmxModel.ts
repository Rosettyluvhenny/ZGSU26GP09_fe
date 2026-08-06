/**
 * Client-side parser that turns an OData `$metadata` (EDMX) document into a
 * structured, browsable model. Handles both OData V2 (…/ado/…edm) and V4
 * (…/odata/ns/edm) shapes on a best-effort basis: it reads elements by local
 * name so namespace differences between the two versions do not matter, and it
 * never throws — malformed input yields an `EdmModel` with an `error` message
 * and empty collections.
 */

export type EdmVersion = 'v2' | 'v4' | 'unknown';

export interface EdmAnnotation {
	name: string;
	value: string;
}

export interface EdmProperty {
	name: string;
	type: string;
	nullable: boolean;
	isKey: boolean;
	facets: string;
	label: string;
	annotations: EdmAnnotation[];
}

export interface EdmNavigation {
	name: string;
	/** Target entity type (V4) or the association relationship (V2). */
	target: string;
	/** Multiplicity / role info when available. */
	info: string;
}

export interface EdmEntityType {
	name: string;
	keys: string[];
	properties: EdmProperty[];
	navigations: EdmNavigation[];
	label: string;
	annotations: EdmAnnotation[];
}

export interface EdmEntitySet {
	name: string;
	entityType: string;
	label: string;
}

export interface EdmComplexType {
	name: string;
	properties: EdmProperty[];
}

export interface EdmEnumMember {
	name: string;
	value: string;
}

export interface EdmEnumType {
	name: string;
	underlyingType: string;
	members: EdmEnumMember[];
}

export interface EdmParameter {
	name: string;
	type: string;
	nullable: boolean;
}

export interface EdmOperation {
	name: string;
	/** "Action", "Function" (V4) or "Function Import" (V2). */
	kind: string;
	parameters: EdmParameter[];
	returnType: string;
}

export interface EdmModel {
	version: EdmVersion;
	namespaces: string[];
	entityTypes: EdmEntityType[];
	entitySets: EdmEntitySet[];
	complexTypes: EdmComplexType[];
	enumTypes: EdmEnumType[];
	operations: EdmOperation[];
	error: string;
}

function emptyModel(error = ''): EdmModel {
	return {
		version: 'unknown',
		namespaces: [],
		entityTypes: [],
		entitySets: [],
		complexTypes: [],
		enumTypes: [],
		operations: [],
		error
	};
}

/** Direct child elements of `parent` whose local name matches. */
function childrenByLocalName(parent: Element, localName: string): Element[] {
	const out: Element[] = [];
	const children = parent.children;
	for (let i = 0; i < children.length; i++) {
		if (children[i].localName === localName) {
			out.push(children[i]);
		}
	}
	return out;
}

/** All descendant elements in the document whose local name matches, namespace-agnostic. */
function elementsByLocalName(doc: Document, localName: string): Element[] {
	const nodes = doc.getElementsByTagNameNS('*', localName);
	const out: Element[] = [];
	for (let i = 0; i < nodes.length; i++) {
		out.push(nodes[i]);
	}
	return out;
}

function attr(el: Element, name: string): string {
	return (el.getAttribute(name) ?? '').trim();
}

/** Strip a leading `Namespace.` qualifier for a friendlier display value. */
function shortType(value: string): string {
	if (!value) {
		return '';
	}
	// Preserve collection wrappers like Collection(ns.Type).
	const collection = /^Collection\((.*)\)$/.exec(value);
	if (collection) {
		return `Collection(${shortType(collection[1])})`;
	}
	const dot = value.lastIndexOf('.');
	return dot >= 0 ? value.slice(dot + 1) : value;
}

/** SAP/OData vocabulary attributes carried on an element (sap:label, sap:creatable, …). */
function collectAnnotationAttrs(el: Element): EdmAnnotation[] {
	const out: EdmAnnotation[] = [];
	const attrs = el.attributes;
	for (let i = 0; i < attrs.length; i++) {
		const a = attrs[i];
		const name = a.name;
		if (name.startsWith('xmlns')) {
			continue;
		}
		// Namespaced (prefixed) attributes are the extension/vocabulary ones.
		if (name.includes(':')) {
			out.push({ name, value: a.value });
		}
	}
	return out;
}

function readLabel(el: Element): string {
	return attr(el, 'sap:label') || attr(el, 'Label');
}

function readFacets(el: Element): string {
	const parts: string[] = [];
	const maxLength = attr(el, 'MaxLength');
	const precision = attr(el, 'Precision');
	const scale = attr(el, 'Scale');
	if (maxLength) {
		parts.push(`MaxLength ${maxLength}`);
	}
	if (precision) {
		parts.push(`Precision ${precision}`);
	}
	if (scale) {
		parts.push(`Scale ${scale}`);
	}
	return parts.join(' · ');
}

function readProperties(parent: Element, keyNames: Set<string>): EdmProperty[] {
	return childrenByLocalName(parent, 'Property').map((prop) => {
		const name = attr(prop, 'Name');
		const nullableAttr = attr(prop, 'Nullable');
		return {
			name,
			type: shortType(attr(prop, 'Type')),
			// EDMX default for Nullable is true; only an explicit "false" makes it required.
			nullable: nullableAttr.toLowerCase() !== 'false',
			isKey: keyNames.has(name),
			facets: readFacets(prop),
			label: readLabel(prop),
			annotations: collectAnnotationAttrs(prop)
		};
	});
}

function readKeys(entityType: Element): string[] {
	const keyEl = childrenByLocalName(entityType, 'Key')[0];
	if (!keyEl) {
		return [];
	}
	return childrenByLocalName(keyEl, 'PropertyRef')
		.map((ref) => attr(ref, 'Name'))
		.filter(Boolean);
}

function readNavigations(entityType: Element): EdmNavigation[] {
	return childrenByLocalName(entityType, 'NavigationProperty').map((nav) => {
		// V4 carries Type directly; V2 references an Association via Relationship/ToRole.
		const v4Type = attr(nav, 'Type');
		const relationship = attr(nav, 'Relationship');
		const toRole = attr(nav, 'ToRole');
		const fromRole = attr(nav, 'FromRole');
		const roleInfo = [fromRole, toRole].filter(Boolean).join(' → ');
		return {
			name: attr(nav, 'Name'),
			target: v4Type ? shortType(v4Type) : shortType(relationship),
			info: v4Type ? (attr(nav, 'Nullable').toLowerCase() === 'false' ? 'required' : '') : roleInfo
		};
	});
}

function detectVersion(doc: Document): EdmVersion {
	const edmx = elementsByLocalName(doc, 'Edmx')[0];
	const version = edmx ? attr(edmx, 'Version') : '';
	if (version.startsWith('4')) {
		return 'v4';
	}
	if (version.startsWith('1') || version.startsWith('2') || version.startsWith('3')) {
		return 'v2';
	}
	// Fall back to the Schema namespace when the Edmx version is absent.
	const schema = elementsByLocalName(doc, 'Schema')[0];
	const ns = schema ? schema.namespaceURI ?? '' : '';
	if (ns.includes('/odata/ns/edm')) {
		return 'v4';
	}
	if (ns.includes('/ado/')) {
		return 'v2';
	}
	return 'unknown';
}

export function parseEdmx(xml: string): EdmModel {
	if (!xml || !xml.trim()) {
		return emptyModel('No metadata XML available.');
	}

	let doc: Document;
	try {
		doc = new DOMParser().parseFromString(xml, 'application/xml');
	} catch {
		return emptyModel('Metadata XML could not be parsed.');
	}

	// DOMParser reports failures via an embedded <parsererror> element.
	if (doc.getElementsByTagName('parsererror').length > 0) {
		return emptyModel('Metadata XML is not well-formed.');
	}

	const model = emptyModel();
	model.version = detectVersion(doc);

	model.namespaces = elementsByLocalName(doc, 'Schema')
		.map((schema) => attr(schema, 'Namespace'))
		.filter(Boolean);

	model.entityTypes = elementsByLocalName(doc, 'EntityType').map((et) => {
		const keys = readKeys(et);
		const keySet = new Set(keys);
		return {
			name: attr(et, 'Name'),
			keys,
			properties: readProperties(et, keySet),
			navigations: readNavigations(et),
			label: readLabel(et),
			annotations: collectAnnotationAttrs(et)
		};
	});

	model.complexTypes = elementsByLocalName(doc, 'ComplexType').map((ct) => ({
		name: attr(ct, 'Name'),
		properties: readProperties(ct, new Set<string>())
	}));

	model.enumTypes = elementsByLocalName(doc, 'EnumType').map((en) => ({
		name: attr(en, 'Name'),
		underlyingType: shortType(attr(en, 'UnderlyingType')),
		members: childrenByLocalName(en, 'Member').map((m) => ({
			name: attr(m, 'Name'),
			value: attr(m, 'Value')
		}))
	}));

	model.entitySets = elementsByLocalName(doc, 'EntitySet').map((set) => ({
		name: attr(set, 'Name'),
		entityType: shortType(attr(set, 'EntityType')),
		label: readLabel(set)
	}));

	const readParameters = (el: Element): EdmParameter[] =>
		childrenByLocalName(el, 'Parameter').map((param) => ({
			name: attr(param, 'Name'),
			type: shortType(attr(param, 'Type')),
			nullable: attr(param, 'Nullable').toLowerCase() !== 'false'
		}));

	const readReturnType = (el: Element): string => {
		const inline = attr(el, 'ReturnType');
		if (inline) {
			return shortType(inline);
		}
		const child = childrenByLocalName(el, 'ReturnType')[0];
		return child ? shortType(attr(child, 'Type')) : '';
	};

	const actions = elementsByLocalName(doc, 'Action').map((el) => ({
		name: attr(el, 'Name'),
		kind: 'Action',
		parameters: readParameters(el),
		returnType: readReturnType(el)
	}));

	const functions = elementsByLocalName(doc, 'Function').map((el) => ({
		name: attr(el, 'Name'),
		kind: 'Function',
		parameters: readParameters(el),
		returnType: readReturnType(el)
	}));

	const functionImports = elementsByLocalName(doc, 'FunctionImport').map((el) => ({
		name: attr(el, 'Name'),
		kind: 'Function Import',
		parameters: readParameters(el),
		returnType: readReturnType(el)
	}));

	model.operations = [...actions, ...functions, ...functionImports];

	return model;
}
