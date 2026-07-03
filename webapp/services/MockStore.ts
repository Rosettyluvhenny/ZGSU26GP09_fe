import type { Job, Registry } from '../model/types';

const DATA_KEY = 'com.zgp9.fe.mock-data';
const SESSION_KEY = 'com.zgp9.fe.session';

function iso(minutesOffset = 0): string {
	const date = new Date();
	date.setMinutes(date.getMinutes() + minutesOffset);
	return date.toISOString();
}

function createVersion(registryName: string, versionNumber: string, createdBy: string, comment: string, suffix: string) {
	const xml = [
		`<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">`,
		`  <edmx:DataServices>`,
		`    <Schema Namespace="${registryName}" xmlns="http://docs.oasis-open.org/odata/ns/edm">`,
		`      <EntityType Name="${registryName}Entity${suffix}">`,
		`        <Key><PropertyRef Name="ID" /></Key>`,
		`        <Property Name="ID" Type="Edm.String" Nullable="false" />`,
		`        <Property Name="Name" Type="Edm.String" />`,
		`        <Property Name="Status" Type="Edm.String" />`,
		`      </EntityType>`,
		`    </Schema>`,
		`  </edmx:DataServices>`,
		`</edmx:Edmx>`
	].join("\n");

	return {
		id: `${registryName.toLowerCase()}-${versionNumber}`,
		versionNumber,
		createdBy,
		createdAt: iso(-180),
		comment,
		metadata: {
			entityTypes: [`${registryName}Entity${suffix}`],
			entitySets: [`${registryName}Entities`],
			properties: ['ID', 'Name', 'Status'],
			navigationProperties: ['to_Items'],
			functionImports: ['GetStatus'],
			actions: ['Activate', 'Deactivate'],
			complexTypes: ['Address']
		},
		xml
	};
}

function createRegistry(seed: number): Registry {
	const registryName = seed === 1 ? 'SalesRegistry' : seed === 2 ? 'ScanRegistry' : 'FinanceRegistry';
	const serviceName = seed === 1 ? 'SalesService' : seed === 2 ? 'ScanService' : 'FinanceService';
	const versions = [
		createVersion(registryName, '1.0.0', 'demo.user', 'Initial release', 'A'),
		createVersion(registryName, '1.1.0', 'demo.user', 'Expanded fields', 'B')
	];

	return {
		id: `reg-${seed}`,
		registryName,
		serviceName,
		serviceType: seed === 3 ? 'CDS' : 'RAP',
		status: seed === 2 ? 'Unpublish' : seed === 3 ? 'Archive' : 'Publish',
		description: `${registryName} manages backend service metadata for the frontend demo.`,
		createdBy: 'demo.user',
		createdAt: iso(-720),
		lastChangedBy: 'demo.user',
		lastChangedAt: iso(-60),
		serviceDefinition: `/sap/opu/odata4/${serviceName.toLowerCase()}/`,
		versions
	};
}

function createJob(registry: Registry, minutesAgo: number, status: Job['status']): Job {
	const start = new Date();
	start.setMinutes(start.getMinutes() - minutesAgo);
	const end = status === 'Running' ? null : new Date(start.getTime() + 5 * 60 * 1000);
	return {
		id: `job-${registry.id}-${minutesAgo}`,
		registryId: registry.id,
		registryName: registry.registryName,
		status,
		startedAt: start.toISOString(),
		finishedAt: end ? end.toISOString() : null,
		durationMs: end ? end.getTime() - start.getTime() : null,
		executedBy: 'demo.user',
		logs: [
			`[INFO] Scan job started for ${registry.registryName}`,
			'[INFO] Retrieved service metadata',
			status === 'Failed' ? '[ERROR] Backend validation returned an error' : '[INFO] Scan finished successfully'
		],
		errorMessage: status === 'Failed' ? 'The selected registry could not be validated.' : '',
		summary: status === 'Failed' ? 'Scan completed with 1 validation issue.' : 'Scan completed and catalog was refreshed.'
	};
}

function createInitialData() {
	const registries = [createRegistry(1), createRegistry(2), createRegistry(3)];
	return {
		registries,
		jobs: [createJob(registries[0], 180, 'Completed'), createJob(registries[1], 90, 'Failed'), createJob(registries[2], 15, 'Running')]
	};
}

export interface MockData {
	registries: Registry[];
	jobs: Job[];
}

function isBrowserStorageAvailable(): boolean {
	return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function readMockData(): MockData {
	if (!isBrowserStorageAvailable()) {
		return createInitialData();
	}

	const raw = window.localStorage.getItem(DATA_KEY);
	if (!raw) {
		const initial = createInitialData();
		window.localStorage.setItem(DATA_KEY, JSON.stringify(initial));
		return initial;
	}

	try {
		return JSON.parse(raw) as MockData;
	} catch {
		const initial = createInitialData();
		window.localStorage.setItem(DATA_KEY, JSON.stringify(initial));
		return initial;
	}
}

export function writeMockData(data: MockData): void {
	if (!isBrowserStorageAvailable()) {
		return;
	}

	window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function readSessionStorage<T>(fallback: T): T {
	if (!isBrowserStorageAvailable()) {
		return fallback;
	}

	const raw = window.localStorage.getItem(SESSION_KEY);
	if (!raw) {
		return fallback;
	}

	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export function writeSessionStorage<T>(value: T): void {
	if (!isBrowserStorageAvailable()) {
		return;
	}

	window.localStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

export function removeSessionStorage(): void {
	if (!isBrowserStorageAvailable()) {
		return;
	}

	window.localStorage.removeItem(SESSION_KEY);
}
