import type ODataModel from 'sap/ui/model/odata/v4/ODataModel';
import Sorter from 'sap/ui/model/Sorter';

import ServiceError from './ServiceError';
import { createODataClient } from './ODataClient';

import type { compareVersionEntry, compareVersionResult, registryVersion, versionCompareActionResult } from '../model/types';
import { mapVersionEntity } from './ODataParsers';
import DetailService from './DetailService';

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

function asString(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	const primitive = value as string | number | boolean | bigint;
	return String(primitive);
}

function mapCompareEntry(entry: Record<string, unknown>): compareVersionEntry {
	return {
		serviceDefId: asString(entry.SERVICEDEFID),
		baseDetailId: asString(entry.BASEDETAILID),
		compareDetailId: asString(entry.COMPAREDETAILID),
		changeType: (asString(entry.CHANGETYPE).toUpperCase() as compareVersionEntry['changeType']) || 'UNCHANGED'
	};
}

function mapCompareResult(payload: Record<string, unknown>): compareVersionResult {
	return {
		baseVersionId: asString(payload.BASEVERSIONID),
		compareVersionId: asString(payload.COMPAREVERSIONID),
		change: Array.isArray(payload.CHANGE) ? payload.CHANGE.map(mapCompareEntry) : [],
		differ: Array.isArray(payload.DIFFER) ? payload.DIFFER.map(mapCompareEntry) : [],
		unchange: Array.isArray(payload.UNCHANGE) ? payload.UNCHANGE.map(mapCompareEntry) : []
	};
}

export default class VersionService {
	private readonly odata: ReturnType<typeof createODataClient>;

	public constructor(private readonly detailService: DetailService, model: ODataModel) {
		this.odata = createODataClient(model);
	}

	public async getVersions(registryId: string): Promise<registryVersion[]> {
		const backendVersions = await this.loadVersionsFromBackend(registryId);
		return delay(backendVersions);
	}

	public async getVersion(versionId: string): Promise<registryVersion> {
		const backendVersion = await this.loadVersionFromBackend(versionId);
		if (!backendVersion) {
			throw new ServiceError(404, 'Version not found.');
		}
		return delay(backendVersion);
	}

	public async compareVersions(leftVersionId: string, rightVersionId: string): Promise<compareVersionResult> {
		const oHeaderContext = this.odata.getHeaderContext('/Version');

		const result = await this.odata.callAction<versionCompareActionResult>(
			'com.sap.gateway.srvd_a2x.zsr_registry.v0001.compareVersion(...)',
			{
				context: oHeaderContext,
				parameters: {
					BaseVrsId: leftVersionId,
					CompareVrsId: rightVersionId
				}
			}
		);

		return delay(mapCompareResult(result as unknown as Record<string, unknown>));
	}

	// ---------------------------------------------------------------------
	// Internal helpers
	// ---------------------------------------------------------------------

	private versionPath(versionId: string): string {
		return `/Version(${formatGuidLiteral(versionId)})`;
	}

	private async loadVersionsFromBackend(registryId: string): Promise<registryVersion[]> {
		const entities = await this.odata.readList(`/Registry(${formatGuidLiteral(registryId)})/_Version`, {
			sorters: [new Sorter('CreatedAt', true)]
		});

		return entities.map((entity) => this.loadVersionFromEntity(entity));
	}

	private async loadVersionFromBackend(versionId: string): Promise<registryVersion | null> {
		const entity = await this.odata.readOne(this.versionPath(versionId));
		if (!entity) {
			return null;
		}

		return this.loadVersionFromEntity(entity);
	}

	private loadVersionFromEntity(entity: Record<string, unknown>): registryVersion {
		let parsedDetail: { detailId: string; metadataXml: string } | undefined;
		return mapVersionEntity(entity, parsedDetail);
	}
}