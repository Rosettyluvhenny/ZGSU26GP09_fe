import ODataClient from './ODataClient';
import ServiceError from './ServiceError';

import type { CompareVersionEntry, CompareVersionResult, RegistryVersion, VersionCompareActionEntry, VersionCompareActionResult } from '../model/types';
import { mapVersionEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';
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

function mapCompareEntry(entry: VersionCompareActionEntry): CompareVersionEntry {
	return {
		serviceDefId: asString(entry.SERVICEDEFID),
		baseDetailId: asString(entry.BASEDETAILID),
		compareDetailId: asString(entry.COMPAREDETAILID),
		changeType: (asString(entry.CHANGETYPE).toUpperCase() as CompareVersionEntry['changeType']) || 'UNCHANGED'
	};
}

function mapCompareResult(payload: VersionCompareActionResult): CompareVersionResult {
	return {
		baseVersionId: asString(payload.BASEVERSIONID),
		compareVersionId: asString(payload.COMPAREVERSIONID),
		change: Array.isArray(payload.CHANGE) ? payload.CHANGE.map(mapCompareEntry) : [],
		differ: Array.isArray(payload.DIFFER) ? payload.DIFFER.map(mapCompareEntry) : [],
		unchange: Array.isArray(payload.UNCHANGE) ? payload.UNCHANGE.map(mapCompareEntry) : []
	};
}

export default class VersionService {
	private readonly client: ODataClient;

	public constructor(private readonly detailService: DetailService, model?: import("sap/ui/model/odata/v4/ODataModel").default) {
		this.client = new ODataClient(model);
	}

	public async getVersions(registryId: string): Promise<RegistryVersion[]> {
		const backendVersions = await this.loadVersionsFromBackend(registryId);
		return delay(backendVersions);
	}

	public async getVersion(versionId: string): Promise<RegistryVersion> {
		const backendVersion = await this.loadVersionFromBackend(versionId);
		if (!backendVersion) {
			throw new ServiceError(404, 'Version not found.');
		}
		return delay(backendVersion);
	}

	public async compareVersions(leftVersionId: string, rightVersionId: string): Promise<CompareVersionResult> {
		const headers = await this.client.ensureWriteHeaders('POST');
		const payload = normalizeODataEntity(
			await this.client.postJson(
			'/Version/com.sap.gateway.srvd_a2x.zsr_registry.v0001.compareVersion',
			{
				BaseVrsId: leftVersionId,
				CompareVrsId: rightVersionId
			},
				{ headers }
			)
		) as unknown as VersionCompareActionResult;
		return mapCompareResult(payload);
	}

	private async loadVersionsFromBackend(registryId: string): Promise<RegistryVersion[]> {
		const payload = await this.client.readJson(`/Registry/${formatGuidLiteral(registryId)}/_Version?$orderby=CreatedAt desc`);
		const versions = normalizeODataCollection(payload);
		return versions.map((entity) => this.loadVersionFromEntity(entity));
	}

	private async loadVersionFromBackend(versionId: string): Promise<RegistryVersion | null> {
		const payload = await this.client.readJson(`/Version/${formatGuidLiteral(versionId)}`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return this.loadVersionFromEntity(entity);
	}

	private loadVersionFromEntity(entity: Record<string, unknown>): RegistryVersion {
		let parsedDetail: { detailId: string; metadataXml: string } | undefined;
		return mapVersionEntity(entity, parsedDetail);
	}
}


