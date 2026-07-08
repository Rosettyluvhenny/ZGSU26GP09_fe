export type RegistryStatus = 'Published' | 'Unpublished' | 'Archive';

export type JobStatus = 'Completed' | 'Running' | 'Failed' | 'Queued';

export interface MetadataDetails {
	entityTypes: string[];
	entitySets: string[];
	properties: string[];
	navigationProperties: string[];
	functionImports: string[];
	actions: string[];
	complexTypes: string[];
}

export interface VersionDifference {
	added: string[];
	removed: string[];
	modified: string[];
	unchanged: string[];
}

export interface RegistryVersion {
	id: string;
	groupId?: string;
	versionNumber: string;
	createdBy: string;
	createdAt: string;
	comment: string;
	metadata: MetadataDetails;
	xml: string;
}

export interface RegistryDetail {
	id: string;
	versionId: string;
	groupId: string;
	serviceDefinition: string;
	serviceHash: string;
	lastChangedAt: string;
	xml: string;
}

export interface Registry {
	id: string;
	registryName: string;
	serviceName: string;
	serviceType: string;
	etag?: string;
	versionNo?: string;
	status: RegistryStatus;
	statusText: string;
	description: string;
	createdBy: string;
	createdAt: string;
	lastChangedBy: string;
	lastChangedAt: string;
	serviceDefinition: string;
	versions: RegistryVersion[];
}

export interface Job {
	id: string;
	registryId: string;
	registryName: string;
	status: JobStatus;
	startedAt: string;
	finishedAt: string | null;
	durationMs: number | null;
	executedBy: string;
	logs: string[];
	errorMessage: string;
	summary: string;
}

export interface SessionData {
	authenticated: boolean;
	userName: string;
	csrfToken: string;
	loginAt: string | null;
}

export interface RegistryInput {
	registryName: string;
	serviceDefinition: string;
	serviceType: string;
	description: string;
}

export interface RegistryCreateInput {
	groupName: string;
	groupType: string;
	versionNo: string;
}

export interface RegistryUpdateInput {
	status: string;
}

export interface RegistryValueHelpItem {
	key: string;
	text: string;
}

export interface JobRunInput {
	registryId: string;
}

export interface RegistryFilterState {
	search: string;
	status: string;
}

export interface MetadataSearchResult {
	category: keyof MetadataDetails;
	label: string;
}

export interface DetailMetadataResult {
	detailId: string;
	metadataXml: string;
}

export interface XmlLineEntry {
	lineNo: number;
	text: string;
	isWhitespace: boolean;
}

export interface VersionActionResult {
	CreatedAt: string | null;
	CreatedBy: string;
	GroupHash: string;
	GroupId: string;
	LatestVersion: boolean;
	Status: string;
	TriggerType: string;
	VersionId: string;
	VersionNo: string;
}

export interface VersionCompareActionEntry {
	SERVICEDEFID: string;
	BASEDETAILID: string;
	COMPAREDETAILID: string;
	CHANGETYPE: 'CHANGED' | 'ADDED' | 'DELETED' | 'UNCHANGED' | string;
}

export interface VersionCompareActionResult {
	BASEVERSIONID: string;
	COMPAREVERSIONID: string;
	CHANGE: VersionCompareActionEntry[];
	DIFFER: VersionCompareActionEntry[];
	UNCHANGE: VersionCompareActionEntry[];
}

export interface NodeTreeAttribute {
	name: string;
	value: string;
}

export interface NodeTreeResponseItem {
	nodeId: string;
	semanticId: string;
	parentId: string;
	nodePath: string;
	nodeType: string;
	nodeName: string;
	nodeAlias: string;
	offsetStart: number;
	offsetEnd: number;
	seq: number;
	depth: number;
	attributes: NodeTreeAttribute[];
}

export interface NodeTreeViewItem extends NodeTreeResponseItem {
	label: string;
	children: NodeTreeViewItem[];
	lineStart: number;
	lineEnd: number;
	diffStatus?: string;
	detailId?: string;
	isAttribute?: boolean;
	isAttributeGroup?: boolean;
	highlight?: string;
}

export interface NodeTreeActionResult {
	NODETREE: NodeTreeResponseItem[];
}

export interface NodeDiffAttribute {
	SEMANTIC_ID: string;
	NAME: string;
	STATUS: string;
	OLD_VALUE: string;
	NEW_VALUE: string;
}

export interface NodeDiffEntry {
	SEMANTIC_ID: string;
	STATUS: string;
	ATTRIBUTEDIFF: NodeDiffAttribute[];
}

export interface NodeDiffActionResult {
	NODEDIFF: NodeDiffEntry[];
}

export interface CompareVersionEntry {
	serviceDefId: string;
	baseDetailId: string;
	compareDetailId: string;
	changeType: 'CHANGED' | 'ADDED' | 'DELETED' | 'UNCHANGED';
}

export interface CompareVersionResult {
	baseVersionId: string;
	compareVersionId: string;
	change: CompareVersionEntry[];
	differ: CompareVersionEntry[];
	unchange: CompareVersionEntry[];
}

export interface DetailId {
	DetailId: string;
}