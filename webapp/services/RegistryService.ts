import ODataClient, { SERVICE_ORIGIN } from './ODataClient';
import ServiceError from './ServiceError';

import type { Registry, RegistryCreateInput, RegistryUpdateInput, RegistryValueHelpItem, RegistryVersion, VersionActionResult } from '../model/types';
import { emptyMetadata, mapRegistryEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
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
	await ODataClient.ensureAuth();
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

	const text = await response.text();
	if (!text) {
		return {};
	}
	
	try {
		return JSON.parse(text);
	} catch {
		return {};
	}
}

async function writeJson(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown, headers: Record<string, string>): Promise<unknown> {
	await ODataClient.ensureAuth();
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

	const text = await response.text();
	if (!text) {
		return {};
	}
	
	try {
		return JSON.parse(text);
	} catch {
		return {};
	}
}



export default class RegistryService {
	private readonly client = new ODataClient();

	public async getPermissions(): Promise<string[]> {
		const csrfToken = await this.client.fetchCsrfToken();
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
		const payload = await readJson('/ZI_GRP_TYPE_VH');
		const items = toValueHelpItems(payload, ['TypeId']);
		return delay(items);
	}

	public async getStatuses(): Promise<RegistryValueHelpItem[]> {
		const payload = await readJson('/ZI_GRP_STAT_VH');
		const items = toValueHelpItems(payload, ['StatusId']);
		return delay(items);
	}

	public async getRegistries(search = '', status = 'All'): Promise<Registry[]> {
		const backendRegistries = await this.loadRegistriesFromBackend();
		return delay(this.filterRegistries(backendRegistries, search, status));
	}

	public async getRegistry(registryId: string): Promise<Registry> {
		const backendRegistry = await this.loadRegistryFromBackend(registryId);
		if (!backendRegistry) {
			throw new ServiceError(404, 'Registry not found.');
		}
		return delay(backendRegistry);
	}

	public async createRegistry(input: RegistryCreateInput, createdBy = 'demo.user'): Promise<Registry> {
		const validationMessages = this.validateCreateInput(input);
		if (validationMessages.length > 0) {
			throw new ServiceError(400, 'Registry validation failed.', validationMessages);
		}

		const headers = await this.client.ensureWriteHeaders('POST');
		const payload: Record<string, string> = {
			GroupName: input.groupName.trim(),
			GroupType: input.groupType.trim()
		};
		if (input.versionNo.trim()) {
			payload.VersionNo = input.versionNo.trim();
		}

		const entity = normalizeODataEntity(await writeJson('/Registry', 'POST', payload, headers));
		return delay(mapRegistryEntity(entity, { serviceDefinition: '' }));
	}

	public async updateRegistry(registryId: string, input: RegistryUpdateInput, changedBy = 'demo.user'): Promise<Registry> {
		const validationMessages = this.validateUpdateInput(input);
		if (validationMessages.length > 0) {
			throw new ServiceError(400, 'Registry validation failed.', validationMessages);
		}

		const headers = await this.client.ensureWriteHeaders('PATCH');
		const entity = normalizeODataEntity(await writeJson(`/Registry(${formatGuidLiteral(registryId)})`, 'PATCH', { Status: input.status.trim() }, headers));
		return delay(mapRegistryEntity(entity, { serviceDefinition: '' }));
	}

	public async deleteRegistry(registryId: string): Promise<void> {
		await this.client.ensureWriteHeaders('DELETE');
		await writeJson(`/Registry(${formatGuidLiteral(registryId)})`, 'DELETE', undefined, await this.client.ensureWriteHeaders('DELETE'));
		return delay(undefined);
	}

	public async activateRegistry(registryId: string, changedBy = 'demo.user'): Promise<Registry> {
		return this.changeStatus(registryId, 'Published', changedBy);
	}

	public async deactivateRegistry(registryId: string, changedBy = 'demo.user'): Promise<Registry> {
		return this.changeStatus(registryId, 'Unpublished', changedBy);
	}

	public async generateVersion(registryId: string, etag?: string, comment = 'Generated via frontend', changedBy = 'demo.user'): Promise<any> {
		const headers = await this.client.ensureWriteHeaders('POST');
		if (etag) {
			headers['If-Match'] = etag;
		}
		const payload = normalizeODataEntity(
			await writeJson(
				`/Registry/${formatGuidLiteral(registryId)}/com.sap.gateway.srvd_a2x.zsr_registry.v0001.generateVersion`,
				'POST',
				undefined,
				headers
			)
		);
		return delay(payload, 350);
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
		const headers = await this.client.ensureWriteHeaders('PATCH');
		const entity = normalizeODataEntity(await writeJson(`/Registry(${formatGuidLiteral(registryId)})`, 'PATCH', { Status: status }, headers));
		return delay(mapRegistryEntity(entity, { serviceDefinition: '' }));
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
				return 'Published';
			case 'U':
				return 'Unpublished';
			case 'A':
				return 'Archive';
			default:
				return 'Unpublished';
		}
	}
}
