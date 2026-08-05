export type registryStatus = 'Published' | 'Unpublished' | 'Archive';

export type jobStatus = 'Completed' | 'Running' | 'Failed' | 'Queued';

export interface metadataDetails {
	entityTypes: string[];
	entitySets: string[];
	properties: string[];
	navigationProperties: string[];
	functionImports: string[];
	actions: string[];
	complexTypes: string[];
}

export interface versionDifference {
	added: string[];
	removed: string[];
	modified: string[];
	unchanged: string[];
}

/** Maps to VersionType */
export interface registryVersion {
	versionId: string;
	groupId?: string;
	versionNo: string;
	createdBy: string;
	createdAt: string;
	comment: string;
	metadata: metadataDetails;
	metadataXml: string;
}

/** Maps to DetailType */
export interface registryDetail {
	detailId: string;
	versionId: string;
	groupId: string;
	serviceDefId: string;
	serviceHash: string;
	lastChangeAt: string;
	metadataXml: string;
}

/** Maps to RegistryType */
export interface registry {
	groupId: string;
	groupName: string;
	serviceName: string;
	groupType: string;
	etag?: string;
	versionNo?: string;
	status: registryStatus;
	statusText: string;
	description: string;
	registeredBy: string;
	registeredAt: string;
	lastChangedBy: string;
	lastChangeAt: string;
	serviceDefinition: string;
	versions: registryVersion[];
}

/** Maps to ScanJobType */
export interface job {
	scanJobId: string;
	status: jobStatus;
	startedAt: string;
	finishedAt: string | null;
	durationMs: number | null;
	triggeredBy: string;

	triggerType: string;
	triggerText: string;
	totalRegistry: number;
	changeCount: number;
	newVersionCount: number;

	logs: string[];
	errorMessage: string;
	summary: string;
}

/** Maps to LogType */
export interface logEntry {
	logId: string;
	actionType: string;
	/** Human-readable action label from BE (ActionText); fall back to actionType if missing. */
	actionText: string;
	actor: string;
	actionAt: string;
	ipAddress: string;
	remarks: string;
	logResult: string;
	objectId: string;
	objectIdType: string;
	jobId: string;
}

export interface sessionData {
	authenticated: boolean;
	userName: string;
	csrfToken: string;
	loginAt: string | null;
}

export interface registryInput {
	groupName: string;
	serviceDefinition: string;
	groupType: string;
	description: string;
}

export interface registryCreateInput {
	groupName: string;
	groupType: string;
	versionNo: string;
}

export interface registryUpdateInput {
	status: string;
}

export interface registryValueHelpItem {
	key: string;
	text: string;
}

export interface jobRunInput {
	groupId: string;
}

export interface registryFilterState {
	search: string;
	searchField: string;
	status: string;
	groupType: string;
	groupName: string;
	registeredBy: string;
}

export interface metadataSearchResult {
	category: keyof metadataDetails;
	label: string;
}

/** Maps to ZI_METADATA_RESULT */
export interface detailMetadataResult {
	detailId: string;
	metadataXml: string;
}

export interface xmlLineEntry {
	lineNo: number;   // 0 = empty/padding row (no matching line on this side)
	text: string;
	isWhitespace: boolean;
	highlight?: string;
	lineType?: 'same' | 'del' | 'ins' | 'mod' | 'empty';
}

/** Maps to ZI_VERSION_RESULT */
export interface versionActionResult {
	createdAt: string | null;
	createdBy: string;
	groupHash: string;
	groupId: string;
	latestVersion: boolean;
	status: string;
	triggerType: string;
	versionId: string;
	versionNo: string;
}

/** Maps to ZDVRSDIFF */
export interface versionCompareActionEntry {
	serviceDefId: string;
	baseDetailId: string;
	compareDetailId: string;
	changeType: string;
}

/** Maps to ZDVRSDIFFRESULT */
export interface versionCompareActionResult {
	baseVersionId: string;
	compareVersionId: string;
	change: versionCompareActionEntry[];
	differ: versionCompareActionEntry[];
	unchange: versionCompareActionEntry[];
}

/** Maps to ZDATTRIBUTE */
export interface nodeTreeAttribute {
	name: string;
	value: string;
}

/** Maps to ZDNODETREE */
export interface nodeTreeResponseItem {
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
	attributes: nodeTreeAttribute[];
}

export interface nodeTreeViewItem extends nodeTreeResponseItem {
	label: string;
	children: nodeTreeViewItem[];
	lineStart: number;
	lineEnd: number;
	diffStatus?: string;
	detailId?: string;
	isAttribute?: boolean;
	isAttributeGroup?: boolean;
	highlight?: string;
	shouldExpand?: boolean;
}

/** Maps to ZNODETREERESULT */
export interface nodeTreeActionResult {
	nodeTree: Record<string, unknown>[];
}

/** Maps to ZDATTRIBUTEDIFF */
export interface nodeDiffAttribute {
	semanticId: string;
	name: string;
	status: string;
	oldValue: string;
	newValue: string;
}

/** Maps to ZDNODEDIFF */
export interface nodeDiffEntry {
	semanticId: string;
	status: string;
	attributeDiff: nodeDiffAttribute[];
}

/** Maps to ZDNODEDIFFRESULT */
export interface nodeDiffActionResult {
	nodeDiff: Record<string, unknown>[];
}

/** Maps to ZDVRSDIFF */
export interface compareVersionEntry {
	serviceDefId: string;
	baseDetailId: string;
	compareDetailId: string;
	changeType: 'CHANGED' | 'ADDED' | 'DELETED' | 'UNCHANGED';
}

/** Maps to ZDVRSDIFFRESULT */
export interface compareVersionResult {
	baseVersionId: string;
	compareVersionId: string;
	change: compareVersionEntry[];
	differ: compareVersionEntry[];
	unchange: compareVersionEntry[];
}

/** Maps to ZI_METADATA_RESULT */
export interface detailId {
	detailId: string;
}

/** Maps to DetailType_sendEmailParams */
export interface sendMailParams {
	htmlContent: string;
	recipients: string;
	subject: string;
}

/** Maps to ZI_EMAIL_SEND_RESULT */
export interface sendMailResult {
	success: boolean;
	message: string;
	failedRecip: string;
	recipientDetail: string;
}