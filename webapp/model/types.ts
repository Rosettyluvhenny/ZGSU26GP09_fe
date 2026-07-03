export type RegistryStatus = 'Publish' | 'Unpublish' | 'Archive';

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
	status: RegistryStatus;
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
