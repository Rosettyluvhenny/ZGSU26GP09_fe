import type ODataModel from 'sap/ui/model/odata/v4/ODataModel';
import type Context from 'sap/ui/model/odata/v4/Context';
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';
import Sorter from 'sap/ui/model/Sorter';

import ServiceError from './ServiceError';

import type { registry, registryCreateInput, registryUpdateInput, registryValueHelpItem } from '../model/types';
import { mapRegistryEntity } from './ODataParsers';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}





function asString(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	const primitive = value as string | number | boolean | bigint;
	return String(primitive);
}

function extractServiceError(error: unknown, context: string): ServiceError {
	// v4 ODataModel operation/binding rejections carry .cause / .message / status varies by version
	const err = error as { message?: string; status?: number; error?: { message?: string }; cause?: { message?: string } };
	const message =
		err?.error?.message ||
		err?.cause?.message ||
		err?.message ||
		`${context} failed.`;
	return new ServiceError(err?.status ?? 500, message);
}

export default class RegistryService {
	private readonly model: ODataModel;

	constructor(model: ODataModel) {
		this.model = model;
	}

	// ---------------------------------------------------------------------
	// Value helps / read-only lookups
	// ---------------------------------------------------------------------

	public async getPermissions(): Promise<string[]> {
		try {
			// Action bound to the Registry collection (no specific key) -> bind on the
			// list binding's header context.
			const oListBinding = this.model.bindList('/Registry');
			const oHeaderContext = oListBinding.getHeaderContext();

			const oOperation = this.model.bindContext(
				'com.sap.gateway.srvd_a2x.zsr_registry.v0001.getPermissions(...)',
				oHeaderContext
			);

			await oOperation.execute();
			const result = oOperation.getBoundContext()?.getObject() as Record<string, unknown>;

			const permissions = this.mapPermissionNames(result);
			if (permissions.length === 0) {
				throw new ServiceError(500, 'Permission response did not contain any permissions.');
			}
			return delay(permissions);
		} catch (error) {
			if (error instanceof ServiceError) {
				throw error;
			}
			throw extractServiceError(error, 'getPermissions');
		}
	}

	public async getGroupTypes(): Promise<registryValueHelpItem[]> {
		const items = await this.readValueHelpList('/ZI_GRP_TYPE_VH', ['TypeId']);
		return delay(items);
	}

	public async getStatuses(): Promise<registryValueHelpItem[]> {
		const items = await this.readValueHelpList('/ZI_GRP_STAT_VH', ['StatusId']);
		return delay(items);
	}

	// ---------------------------------------------------------------------
	// Registry CRUD
	// ---------------------------------------------------------------------

	public async getRegistries(filter: {
		search: string;
		status: string;
		groupType: string;
		registryName: string;
		createdBy: string;
		searchField: string;
	}): Promise<registry[]> {
		const backendRegistries = await this.loadRegistriesFromBackend(filter);
		return delay(this.filterRegistries(backendRegistries, filter));
	}

	public async getRegistry(registryId: string): Promise<registry> {
		const backendRegistry = await this.loadRegistryFromBackend(registryId);
		if (!backendRegistry) {
			throw new ServiceError(404, 'Registry not found.');
		}
		return delay(backendRegistry);
	}

	public async createRegistry(input: registryCreateInput): Promise<registry> {
		const validationMessages = this.validateCreateInput(input);
		if (validationMessages.length > 0) {
			throw new ServiceError(400, 'Registry validation failed.', validationMessages);
		}

		const payload: Record<string, string> = {
			GroupName: input.groupName.trim(),
			GroupType: input.groupType.trim()
		};
		if (input.versionNo.trim()) {
			payload.VersionNo = input.versionNo.trim();
		}

		try {
			const oListBinding = this.model.bindList('/Registry');
			const oContext = oListBinding.create(payload);
			await oContext.created();

			const entity = oContext.getObject() as Record<string, unknown>;
			return delay(mapRegistryEntity(entity, { serviceDefinition: '' }));
		} catch (error) {
			throw extractServiceError(error, 'createRegistry');
		}
	}

	public async updateRegistry(registryId: string, input: registryUpdateInput): Promise<registry> {
		const validationMessages = this.validateUpdateInput(input);
		if (validationMessages.length > 0) {
			throw new ServiceError(400, 'Registry validation failed.', validationMessages);
		}

		return this.changeStatus(registryId, input.status.trim() as registry['status']);
	}

	public async deleteRegistry(registryId: string): Promise<void> {
		try {
			const oContext = this.getRegistryContext(registryId);
			await oContext.delete();
			await delay(undefined);
		} catch (error) {
			throw extractServiceError(error, 'deleteRegistry');
		}
	}

	public async activateRegistry(registryId: string): Promise<registry> {
		return this.changeStatus(registryId, 'Published');
	}

	public async deactivateRegistry(registryId: string): Promise<registry> {
		return this.changeStatus(registryId, 'Unpublished');
	}

	public async generateVersion(registryId: string): Promise<unknown> {
		try {
			const oRegistryContext = this.getRegistryContext(registryId);

			const oOperation = this.model.bindContext(
				'com.sap.gateway.srvd_a2x.zsr_registry.v0001.generateVersion(...)',
				oRegistryContext
			);

			await oOperation.execute();
			const result = oOperation.getBoundContext()?.getObject() as unknown;
			return delay(result, 350);
		} catch (error) {
			throw extractServiceError(error, 'generateVersion');
		}
	}

	// ---------------------------------------------------------------------
	// Internal helpers
	// ---------------------------------------------------------------------

	private getRegistryContext(registryId: string): Context {
		const path = `/Registry(${registryId})`;
		return this.model.bindContext(path).getBoundContext();
	}

	private async readValueHelpList(path: string, keyFields: string[]): Promise<registryValueHelpItem[]> {
		try {
			const oListBinding = this.model.bindList(path);
			const aContexts = await oListBinding.requestContexts();
			const entities = aContexts.map((oContext) => oContext.getObject() as Record<string, unknown>);
			return this.toValueHelpItems(entities, keyFields);
		} catch (error) {
			throw extractServiceError(error, `read ${path}`);
		}
	}

	private toValueHelpItems(entities: Record<string, unknown>[], keyFields: string[]): registryValueHelpItem[] {
		return entities
			.map((entity) => {
				const key = keyFields.map((field) => asString(entity[field])).find((value) => Boolean(value)) ?? '';
				const text = asString(entity.Description) || asString(entity.Text) || key;
				return { key, text };
			})
			.filter((item) => Boolean(item.key));
	}

	private mapPermissionNames(payload: unknown): string[] {
		const record = payload as Record<string, unknown> | undefined;
		const collection = (record?.value ?? record?.Set ?? []) as Array<Record<string, unknown>>;

		const values = collection
			.map((entity) => asString(entity.Permission) || asString(entity.permission) || asString(entity.Name) || asString(entity.name))
			.filter((value) => Boolean(value));

		if (values.length > 0) {
			return values;
		}

		if (Array.isArray(payload)) {
			return (payload as unknown[]).map((item) => asString(item)).filter((value) => Boolean(value));
		}

		return [];
	}

	private filterRegistries(
		registries: registry[],
		filter: { search: string; status: string; groupType: string; registryName: string; createdBy: string }
	): registry[] {
		const normalizedSearch = filter.search.trim().toLowerCase();

		return registries.filter((registryItem) => {
			const matchesSearch =
				!normalizedSearch ||
				[
					registryItem.groupId,
					registryItem.groupName,
					registryItem.serviceName,
					registryItem.groupType,
					registryItem.versionNo,
					registryItem.status,
					registryItem.statusText,
					registryItem.description,
					registryItem.registeredBy,
					registryItem.registeredAt,
					registryItem.lastChangedBy,
					registryItem.lastChangeAt
				]
					.join(' ')
					.toLowerCase()
					.includes(normalizedSearch);

			return matchesSearch;
		});
	}

	private async loadRegistriesFromBackend(filter?: {
		search: string;
		status: string;
		groupType: string;
		registryName: string;
		createdBy: string;
		searchField: string;
	}): Promise<registry[]> {
		const aFilters: Filter[] = [];

		if (filter) {
			if (filter.status && filter.status.toLowerCase() !== 'all') {
				aFilters.push(new Filter('Status', FilterOperator.EQ, filter.status));
			}
			if (filter.groupType && filter.groupType.toLowerCase() !== 'all') {
				aFilters.push(new Filter('GroupType', FilterOperator.EQ, filter.groupType));
			}
			if (filter.registryName) {
				aFilters.push(new Filter('GroupName', FilterOperator.Contains, filter.registryName));
			}
			if (filter.createdBy) {
				aFilters.push(new Filter('RegisteredBy', FilterOperator.Contains, filter.createdBy));
			}

			if (filter.search) {
				const term = filter.search.trim();
				const isGuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(term);

				if (filter.searchField === 'registryName') {
					aFilters.push(new Filter('GroupName', FilterOperator.Contains, term));
				} else if (filter.searchField === 'registryId') {
					aFilters.push(new Filter('GroupId', FilterOperator.EQ, isGuid ? term : '00000000-0000-0000-0000-000000000000'));
				} else if (isGuid) {
					aFilters.push(
						new Filter({
							filters: [
								new Filter('GroupName', FilterOperator.Contains, term),
								new Filter('GroupId', FilterOperator.EQ, term)
							],
							and: false
						})
					);
				} else {
					aFilters.push(new Filter('GroupName', FilterOperator.Contains, term));
				}
			}
		}

		try {
			const oListBinding = this.model.bindList(
				'/Registry',
				undefined,
				[new Sorter('LastChangeAt', true)],
				aFilters.length > 0 ? aFilters : undefined
			);

			const aContexts = await oListBinding.requestContexts();
			const entities = aContexts.map((oContext) => oContext.getObject() as Record<string, unknown>);
			return entities.map((entity) => mapRegistryEntity(entity, { serviceDefinition: '' }));
		} catch (error) {
			throw extractServiceError(error, 'loadRegistriesFromBackend');
		}
	}

	private async loadRegistryFromBackend(registryId: string): Promise<registry | null> {
		try {
			const oContext = this.getRegistryContext(registryId);
			const entity = (await oContext.requestObject()) as Record<string, unknown> | undefined;
			if (!entity || !Object.keys(entity).length) {
				return null;
			}
			return mapRegistryEntity(entity, { serviceDefinition: '' });
		} catch (error) {
			throw extractServiceError(error, 'loadRegistryFromBackend');
		}
	}

	private async changeStatus(registryId: string, status: registry['status']): Promise<registry> {
		try {
			const oContext = this.getRegistryContext(registryId);
			await oContext.setProperty('Status', status);
			await this.model.submitBatch('$auto');

			const entity = oContext.getObject() as Record<string, unknown>;
			return delay(mapRegistryEntity(entity, { serviceDefinition: '' }));
		} catch (error) {
			throw extractServiceError(error, 'changeStatus');
		}
	}

	private validateCreateInput(input: registryCreateInput): string[] {
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

	private validateUpdateInput(input: registryUpdateInput): string[] {
		const messages: string[] = [];
		if (!input.status.trim()) {
			messages.push('Status is required.');
		}
		return messages;
	}
}