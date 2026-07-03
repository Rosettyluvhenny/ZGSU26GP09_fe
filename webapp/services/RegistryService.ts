import ODataClient from './ODataClient';
import ServiceError from './ServiceError';
import { readMockData, writeMockData } from './MockStore';
import type { Registry, RegistryInput, RegistryVersion } from '../model/types';
import { mapRegistryEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

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

export default class RegistryService {
	private readonly client = new ODataClient();

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

	public async createRegistry(input: RegistryInput, createdBy = 'demo.user'): Promise<Registry> {
		const validationMessages = this.validateRegistryInput(input);
		if (validationMessages.length > 0) {
			throw new ServiceError(400, 'Registry validation failed.', validationMessages);
		}

		await this.client.ensureWriteHeaders('POST');

		const data = readMockData();
		const id = `reg-${Date.now().toString(36)}`;
		const version: RegistryVersion = {
			id: `${id}-1.0.0`,
			versionNumber: '1.0.0',
			createdBy,
			createdAt: new Date().toISOString(),
			comment: 'Initial version',
			metadata: {
				entityTypes: [`${input.registryName}Entity100`],
				entitySets: [`${input.registryName}Entities`],
				properties: ['ID', 'Name', 'Status', 'ChangedAt'],
				navigationProperties: ['to_Parent', 'to_Children'],
				functionImports: ['GetOverview', 'GetStatus'],
				actions: ['Activate', 'Deactivate', 'GenerateVersion'],
				complexTypes: ['Address', 'AuditInfo']
			},
			xml: createXml(input.registryName, '1.0.0')
		};

		const registry: Registry = {
			id,
			registryName: input.registryName,
			serviceName: input.registryName.replace(/\s+/g, ''),
			serviceType: input.serviceType,
			status: 'Unpublish',
			description: input.description,
			createdBy,
			createdAt: new Date().toISOString(),
			lastChangedBy: createdBy,
			lastChangedAt: new Date().toISOString(),
			serviceDefinition: input.serviceDefinition,
			versions: [version]
		};

		data.registries.unshift(registry);
		writeMockData(data);
		return delay(JSON.parse(JSON.stringify(registry)) as Registry);
	}

	public async updateRegistry(registryId: string, input: RegistryInput, changedBy = 'demo.user'): Promise<Registry> {
		const validationMessages = this.validateRegistryInput(input);
		if (validationMessages.length > 0) {
			throw new ServiceError(400, 'Registry validation failed.', validationMessages);
		}

		await this.client.ensureWriteHeaders('PATCH');

		const data = readMockData();
		const registry = data.registries.find((item) => item.id === registryId);
		if (!registry) {
			throw new ServiceError(404, 'Registry not found.');
		}

		registry.registryName = input.registryName;
		registry.serviceName = input.registryName.replace(/\s+/g, '');
		registry.serviceType = input.serviceType;
		registry.description = input.description;
		registry.serviceDefinition = input.serviceDefinition;
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
		await this.client.ensureWriteHeaders('POST');
		const data = readMockData();
		const registry = data.registries.find((item) => item.id === registryId);
		if (!registry) {
			throw new ServiceError(404, 'Registry not found.');
		}

		const latest = registry.versions[registry.versions.length - 1];
		const versionNumber = nextVersionNumber(latest?.versionNumber ?? '1.0.0');
		const version: RegistryVersion = {
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
		const payload = await this.client.readJson('/Registry');
		const registries = normalizeODataCollection(payload);
		return registries.map((entity) => mapRegistryEntity(entity, { serviceDefinition: '' }));
	}

	private async loadRegistryFromBackend(registryId: string): Promise<Registry | null> {
		const payload = await this.client.readJson(`/Registry/${formatGuidLiteral(registryId)}`);
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
		registry.lastChangedBy = changedBy;
		registry.lastChangedAt = new Date().toISOString();
		writeMockData(data);
		return delay(JSON.parse(JSON.stringify(registry)) as Registry);
	}

	private validateRegistryInput(input: RegistryInput): string[] {
		const messages: string[] = [];
		if (!input.registryName.trim()) {
			messages.push('Registry Name is required.');
		}
		if (!input.serviceDefinition.trim()) {
			messages.push('Service Definition is required.');
		}
		if (!input.serviceType.trim()) {
			messages.push('Service Type is required.');
		}
		if (!input.description.trim()) {
			messages.push('Description is required.');
		}
		if (input.serviceDefinition.includes('invalid')) {
			messages.push('Backend RAP validation rejected the service definition.');
		}
		return messages;
	}
}
