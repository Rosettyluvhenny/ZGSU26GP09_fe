import ODataClient from './ODataClient';
import ServiceError from './ServiceError';

import type { compareVersionEntry, compareVersionResult, registryVersion, versionCompareActionEntry, versionCompareActionResult } from '../model/types';
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

function mapCompareEntry(entry: versionCompareActionEntry): compareVersionEntry {
	return {
		serviceDefId: asString(entry.serviceDefId),
		baseDetailId: asString(entry.baseDetailId),
		compareDetailId: asString(entry.compareDetailId),
		changeType: (asString(entry.changeType).toUpperCase() as compareVersionEntry['changeType']) || 'UNCHANGED'
	};
}

function mapCompareResult(payload: versionCompareActionResult): compareVersionResult {
	return {
		baseVersionId: asString(payload.baseVersionId),
		compareVersionId: asString(payload.compareVersionId),
		change: Array.isArray(payload.change) ? payload.change.map(mapCompareEntry) : [],
		differ: Array.isArray(payload.differ) ? payload.differ.map(mapCompareEntry) : [],
		unchange: Array.isArray(payload.unchange) ? payload.unchange.map(mapCompareEntry) : []
	};
}

export default class VersionService {
	private readonly client: ODataClient;

	public constructor(private readonly detailService: DetailService, model?: import("sap/ui/model/odata/v4/ODataModel").default) {
		this.client = new ODataClient(model);
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
		) as unknown as versionCompareActionResult;
		return mapCompareResult(payload);
	}

	private async loadVersionsFromBackend(registryId: string): Promise<registryVersion[]> {
		const payload = await this.client.readJson(`/Registry/${formatGuidLiteral(registryId)}/_Version?$orderby=CreatedAt desc`);
		const versions = normalizeODataCollection(payload);
		return versions.map((entity) => this.loadVersionFromEntity(entity));
	}

	private async loadVersionFromBackend(versionId: string): Promise<registryVersion | null> {
		const payload = await this.client.readJson(`/Version/${formatGuidLiteral(versionId)}`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return this.loadVersionFromEntity(entity);
	}

	private loadVersionFromEntity(entity: Record<string, unknown>): registryVersion {
		let parsedDetail: { detailId: string; metadataXml: string } | undefined;
		return mapVersionEntity(entity, parsedDetail);
	}
}


