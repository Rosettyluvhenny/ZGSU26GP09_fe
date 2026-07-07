import ODataClient, { SERVICE_ORIGIN } from './ODataClient';
import ServiceError from './ServiceError';
import { readMockData, writeMockData } from './MockStore';
import type { Registry, RegistryCreateInput, RegistryUpdateInput, RegistryValueHelpItem, RegistryVersion, VersionActionResult } from '../model/types';
import { emptyMetadata, mapRegistryEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}

function createXml(registryName: string, versionNumber: string): string {
	return [
		`<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">`,
		`  <edmx:DataServices>`,
		`    <Schema Namespace="${registryName}" xmlns="http://docs.oasis-open.org/odata/ns/edm">`,
		`      <EntityContainer Name="${registryName}Container">`,
		`        <EntitySet Name="${registryName}Entities" EntityType="${registryName}.${registryName}Entity${versionNumber.replace(/\./g, '')}" />`,
		`      </EntityContainer>`,
		`    </Schema>`,
		`  </edmx:DataServices>`,
		`</edmx:Edmx>`
	].join('\n');
}

function nextVersionNumber(version: string): string {
	const parts = version.split('.').map((part) => Number.parseInt(part, 10));
	if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
		return '1.0.0';
	}

	parts[1] += 1;
	parts[2] = 0;
	return parts.join('.');
}

function normalizeGuid(value: string): string {
	return value.replace(/[{}]/g, '').trim();
}

function formatGuidLiteral(value: string): string {
	return normalizeGuid(value);
}

function isNetworkFailure(error: unknown): boolean {
	return error instanceof TypeError || String(error).toLowerCase().includes('fetch');
}

function asString(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	return String(value);
}

function toValueHelpItems(payload: unknown, keyFields: string[]): RegistryValueHelpItem[] {
	return normalizeODataCollection(payload)
		.map((entity) => {
			const key = keyFields.map((field) => asString(entity[field])).find((value) => Boolean(value)) ?? '';
			const text = asString(entity.Description) || asString(entity.Text) || key;
			return { key, text };
		})
		.filter((item) => Boolean(item.key));
}

function mapPermissionNames(payload: unknown): string[] {
	const records = normalizeODataCollection(payload);
	const values = records
		.map((entity) => asString(entity.Permission) || asString(entity.permission) || asString(entity.Name) || asString(entity.name))
		.filter((value) => Boolean(value));

	if (values.length > 0) {
		return values;
	}

	if (Array.isArray(payload)) {
		return payload.map((item) => asString(item)).filter((value) => Boolean(value));
	}

	return [];
}

function buildServiceUrl(path: string): string {
	const normalizedPath = path.startsWith('http://') || path.startsWith('https://')
		? path
		: `${SERVICE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
	const url = new URL(normalizedPath, window.location.origin);
	url.searchParams.set('sap-client', '324');
	return url.toString();
}

async function parseErrorResponse(response: Response, context: string): Promise<ServiceError> {
	let message = `${context} failed (${response.status})`;
	const details: string[] = [];

	try {
		const text = await response.text();
		if (text) {
			try {
				const payload = JSON.parse(text) as Record<string, unknown>;
				const error = payload.error as Record<string, unknown> | undefined;
				if (error) {
					message = asString(error.message) || asString((error as any).value) || message;
					const inner = error.details as Array<Record<string, unknown>> | undefined;
					if (Array.isArray(inner)) {
						details.push(...inner.map((item) => asString(item.message)).filter((item) => Boolean(item)));
					}
				}
				const messages = payload.SAP__Messages as Array<Record<string, unknown>> | undefined;
				if (Array.isArray(messages)) {
					details.push(...messages.map((item) => asString(item.message)).filter((item) => Boolean(item)));
				}
			} catch {
				message = text.trim() || message;
			}
		}
	} catch {
		// Ignore body parsing failures and fall back to the status-based message.
	}

	return new ServiceError(response.status, message, details);
}

async function readJson(path: string): Promise<unknown> {
	const response = await fetch(buildServiceUrl(path), {
		method: 'GET',
		credentials: 'include',
		headers: {
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		throw await parseErrorResponse(response, `GET ${path}`);
	}

	return response.json();
}

async function writeJson(path: string, method: 'POST' | 'PATCH', body: unknown, headers: Record<string, string>): Promise<unknown> {
	const response = await fetch(buildServiceUrl(path), {
		method,
		credentials: 'include',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...headers
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		throw await parseErrorResponse(response, `${method} ${path}`);
	}

	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		return response.json();
	}

	const text = await response.text();
	return text ? JSON.parse(text) : {};
}

function createMockRegistryFromInput(input: RegistryCreateInput, createdBy: string): Registry {
	const now = new Date().toISOString();
	const groupTypeText = input.groupType === '001' ? 'RAP' : input.groupType === '002' ? 'CDS' : input.groupType;
	return {
		id: `reg-${Date.now().toString(36)}`,
		registryName: input.groupName,
		serviceName: input.groupName.replace(/\s+/g, ''),
		serviceType: groupTypeText,
		status: 'Unpublish',
		statusText: 'Unpublish',
		description: '',
		createdBy,
		createdAt: now,
		lastChangedBy: createdBy,
		lastChangedAt: now,
		serviceDefinition: '',
		versions: []
	};
}

function createMockVersion(registry: Registry, comment = 'Generated via frontend', changedBy = 'demo.user'): RegistryVersion {
	const latest = registry.versions[registry.versions.length - 1];
	const versionNumber = nextVersionNumber(latest?.versionNumber ?? '1.0.0');
	return {
		id: `${registry.id}-${versionNumber}`,
		versionNumber,
		createdBy: changedBy,
		createdAt: new Date().toISOString(),
		comment,
		metadata: {
			entityTypes: [`${registry.registryName}Entity${versionNumber.replace(/\./g, '')}`],
			entitySets: [`${registry.registryName}Entities`],
			properties: ['ID', 'Name', 'Status', 'ChangedAt'],
			navigationProperties: ['to_Parent', 'to_Children'],
			functionImports: ['GetOverview', 'GetStatus'],
			actions: ['Activate', 'Deactivate', 'GenerateVersion'],
			complexTypes: ['Address', 'AuditInfo']
		},
		xml: createXml(registry.registryName, versionNumber)
	};
}

function mapGeneratedVersionResult(result: VersionActionResult): RegistryVersion {
	return {
		id: result.VersionId,
		groupId: result.GroupId,
		versionNumber: result.VersionNo,
		createdBy: result.CreatedBy,
		createdAt: result.CreatedAt ?? new Date().toISOString(),
		comment: '',
		metadata: emptyMetadata(),
		xml: ''
	};
}

export default class RegistryService {
	private readonly client = new ODataClient();

	public async getPermissions(): Promise<string[]> {
		const csrfToken = await this.client.refreshCsrfToken();
		const payload = await this.client.postJson(
			'/Registry/com.sap.gateway.srvd_a2x.zsr_registry.v0001.getPermissions',
			undefined,
			{ headers: { 'X-CSRF-Token': csrfToken } }
		);
		const permissions = mapPermissionNames(payload);
		if (permissions.length === 0) {
			throw new ServiceError(500, 'Permission response did not contain any permissions.');
		}

		return delay(permissions);
	}

	public async getGroupTypes(): Promise<RegistryValueHelpItem[]> {
		try {
			const payload = await readJson('/ZI_GRP_TYPE_VH');
			const items = toValueHelpItems(payload, ['TypeId']);
			if (items.length > 0) {
				return delay(items);
			}
		} catch (error) {
			if (!isNetworkFailure(error)) {
				throw error;
			}
		}

		return delay([
			{ key: '001', text: 'RAP' },
			{ key: '002', text: 'CDS' }
		]);
	}

	public async getStatuses(): Promise<RegistryValueHelpItem[]> {
		try {
			const payload = await readJson('/ZI_GRP_STAT_VH');
			const items = toValueHelpItems(payload, ['StatusId']);
			if (items.length > 0) {
				return delay(items);
			}
		} catch (error) {
			if (!isNetworkFailure(error)) {
				throw error;
			}
		}

		return delay([
			{ key: 'P', text: 'Publish' },
			{ key: 'U', text: 'Unpublish' },
			{ key: 'A', text: 'Archive' }
		]);
	}

	public async getRegistries(search = '', status = 'All'): Promise<Registry[]> {
		try {
			const backendRegistries = await this.loadRegistriesFromBackend();
			if (backendRegistries.length > 0) {
				return delay(this.filterRegistries(backendRegistries, search, status));
			}
		} catch {
			// Fall back to mock data below.
		}

		const data = readMockData();
		return delay(
			this.filterRegistries(
				data.registries.map((registry) => JSON.parse(JSON.stringify(registry)) as Registry),
				search,
				status
			)
		);
	}

	public async getRegistry(registryId: string): Promise<Registry> {
		try {
			const backendRegistry = await this.loadRegistryFromBackend(registryId);
			if (backendRegistry) {
				return delay(backendRegistry);
			}
		} catch {
			// Fall back to mock data below.
		}

		const data = readMockData();
		const registry = data.registries.find((item) => item.id === registryId);
		if (!registry) {
			throw new ServiceError(404, 'Registry not found.');
		}

		return delay(JSON.parse(JSON.stringify(registry)) as Registry);
	}

	public async createRegistry(input: RegistryCreateInput, createdBy = 'demo.user'): Promise<Registry> {
		const validationMessages = this.validateCreateInput(input);
		if (validationMessages.length > 0) {
			throw new ServiceError(400, 'Registry validation failed.', validationMessages);
		}

		try {
			const headers = await this.client.ensureWriteHeaders('POST');
			const payload: Record<string, string> = {
				GroupName: input.groupName.trim(),
				GroupType: input.groupType.trim()
			};
			if (input.versionNo.trim()) {
				payload.VersionNo = input.versionNo.trim();
			}

			const entity = normalizeODataEntity(await writeJson('/Registry', 'POST', payload, headers));
			if (Object.keys(entity).length > 0) {
				return delay(mapRegistryEntity(entity, { serviceDefinition: '' }));
			}
		} catch (error) {
			if (!isNetworkFailure(error)) {
				throw error;
			}
		}

		const data = readMockData();
		const registry = createMockRegistryFromInput(input, createdBy);
		data.registries.unshift(registry);
		writeMockData(data);
		return delay(JSON.parse(JSON.stringify(registry)) as Registry);
	}

	public async updateRegistry(registryId: string, input: RegistryUpdateInput, changedBy = 'demo.user'): Promise<Registry> {
		const validationMessages = this.validateUpdateInput(input);
		if (validationMessages.length > 0) {
			throw new ServiceError(400, 'Registry validation failed.', validationMessages);
		}

		try {
			const headers = await this.client.ensureWriteHeaders('PATCH');
			const entity = normalizeODataEntity(await writeJson(`/Registry(${formatGuidLiteral(registryId)})`, 'PATCH', { Status: input.status.trim() }, headers));
			if (Object.keys(entity).length > 0) {
				return delay(mapRegistryEntity(entity, { serviceDefinition: '' }));
			}
		} catch (error) {
			if (!isNetworkFailure(error)) {
				throw error;
			}
		}

		const data = readMockData();
		const registry = data.registries.find((item) => item.id === registryId);
		if (!registry) {
			throw new ServiceError(404, 'Registry not found.');
		}

		registry.status = this.statusTextFromId(input.status) as Registry['status'];
		registry.statusText = registry.status;
		registry.lastChangedBy = changedBy;
		registry.lastChangedAt = new Date().toISOString();
		writeMockData(data);
		return delay(JSON.parse(JSON.stringify(registry)) as Registry);
	}

	public async deleteRegistry(registryId: string): Promise<void> {
		await this.client.ensureWriteHeaders('DELETE');
		const data = readMockData();
		data.registries = data.registries.filter((item) => item.id !== registryId);
		writeMockData(data);
		return delay(undefined);
	}

	public async activateRegistry(registryId: string, changedBy = 'demo.user'): Promise<Registry> {
		return this.changeStatus(registryId, 'Publish', changedBy);
	}

	public async deactivateRegistry(registryId: string, changedBy = 'demo.user'): Promise<Registry> {
		return this.changeStatus(registryId, 'Unpublish', changedBy);
	}

	public async generateVersion(registryId: string, comment = 'Generated via frontend', changedBy = 'demo.user'): Promise<RegistryVersion> {
		try {
			const headers = await this.client.ensureWriteHeaders('POST');
			const payload = normalizeODataEntity(
				await writeJson(
					`/Registry/${formatGuidLiteral(registryId)}/com.sap.gateway.srvd_a2x.zsr_registry.v0001.generateVersion`,
					'POST',
					undefined,
					headers
				)
			);
			if (Object.keys(payload).length > 0) {
				const generated = mapGeneratedVersionResult(payload as VersionActionResult);
				return delay(generated, 350);
			}
		} catch (error) {
			if (!isNetworkFailure(error)) {
				throw error;
			}
		}

		const data = readMockData();
		const registry = data.registries.find((item) => item.id === registryId);
		if (!registry) {
			throw new ServiceError(404, 'Registry not found.');
		}

		const version = createMockVersion(registry, comment, changedBy);
		registry.versions.push(version);
		registry.lastChangedBy = changedBy;
		registry.lastChangedAt = new Date().toISOString();
		writeMockData(data);
		return delay(JSON.parse(JSON.stringify(version)) as RegistryVersion, 350);
	}

	private filterRegistries(registries: Registry[], search: string, status: string): Registry[] {
		const normalizedSearch = search.trim().toLowerCase();
		const normalizedStatus = status.toLowerCase();
		return registries.filter((registry) => {
			const matchesSearch =
				!normalizedSearch ||
				[
					registry.registryName,
					registry.serviceName,
					registry.serviceType,
					registry.description,
					registry.status
				]
					.join(' ')
					.toLowerCase()
					.includes(normalizedSearch);
			const matchesStatus = normalizedStatus === 'all' || registry.status.toLowerCase() === normalizedStatus;
			return matchesSearch && matchesStatus;
		});
	}

	private async loadRegistriesFromBackend(): Promise<Registry[]> {
		const payload = await readJson('/Registry');
		const registries = normalizeODataCollection(payload);
		return registries.map((entity) => mapRegistryEntity(entity, { serviceDefinition: '' }));
	}

	private async loadRegistryFromBackend(registryId: string): Promise<Registry | null> {
		const payload = await readJson(`/Registry/${formatGuidLiteral(registryId)}`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return mapRegistryEntity(entity, { serviceDefinition: '' });
	}

	private async changeStatus(registryId: string, status: Registry['status'], changedBy: string): Promise<Registry> {
		await this.client.ensureWriteHeaders('PATCH');
		const data = readMockData();
		const registry = data.registries.find((item) => item.id === registryId);
		if (!registry) {
			throw new ServiceError(404, 'Registry not found.');
		}

		registry.status = status;
		registry.statusText = status;
		registry.lastChangedBy = changedBy;
		registry.lastChangedAt = new Date().toISOString();
		writeMockData(data);
		return delay(JSON.parse(JSON.stringify(registry)) as Registry);
	}

	private validateCreateInput(input: RegistryCreateInput): string[] {
		const messages: string[] = [];
		if (!input.groupName.trim()) {
			messages.push('Group Name is required.');
		}
		if (!input.groupType.trim()) {
			messages.push('Group Type is required.');
		}
		if (input.groupType.trim() === '001' && !input.versionNo.trim()) {
			messages.push('Version No is required for group type 001.');
		}
		return messages;
	}

	private validateUpdateInput(input: RegistryUpdateInput): string[] {
		const messages: string[] = [];
		if (!input.status.trim()) {
			messages.push('Status is required.');
		}
		return messages;
	}

	private statusTextFromId(statusId: string): Registry['status'] {
		switch (statusId.trim().toUpperCase()) {
			case 'P':
				return 'Publish';
			case 'U':
				return 'Unpublish';
			case 'A':
				return 'Archive';
			default:
				return 'Unpublish';
		}
	}
}
