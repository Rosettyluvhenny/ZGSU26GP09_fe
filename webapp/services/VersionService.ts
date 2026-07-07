import ODataClient from './ODataClient';
import ServiceError from './ServiceError';
import { readMockData } from './MockStore';
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

	return String(value);
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
	private readonly client = new ODataClient();

	public constructor(private readonly detailService: DetailService) {}

	public async getVersions(registryId: string): Promise<RegistryVersion[]> {
		try {
			const backendVersions = await this.loadVersionsFromBackend(registryId);
			if (backendVersions.length > 0) {
				return delay(backendVersions);
			}
		} catch {
			// Fall back to mock data below.
		}

		const data = readMockData();
		const registry = data.registries.find((item) => item.id === registryId);
		if (!registry) {
			throw new ServiceError(404, 'Registry not found.');
		}

		return delay(
			registry.versions.map((version) => ({
				...version,
				metadata: { ...version.metadata }
			}))
		);
	}

	public async getVersion(versionId: string): Promise<RegistryVersion> {
		try {
			const backendVersion = await this.loadVersionFromBackend(versionId);
			if (backendVersion) {
				return delay(backendVersion);
			}
		} catch {
			// Fall back to mock data below.
		}

		const data = readMockData();
		for (const registry of data.registries) {
			const version = registry.versions.find((item) => item.id === versionId);
			if (version) {
				return delay({
					...version,
					metadata: { ...version.metadata }
				});
			}
		}

		throw new ServiceError(404, 'Version not found.');
	}

	public async compareVersions(leftVersionId: string, rightVersionId: string): Promise<CompareVersionResult> {
		try {
			const headers = await this.client.ensureWriteHeaders('POST');
			const payload = normalizeODataEntity(
				await this.client.postJson(
					'/Version/com.sap.gateway.srvd_a2x.zsr_registry.v0001.compareVersion',
					{
						base_vrs_id: leftVersionId,
						compare_vrs_id: rightVersionId
					},
					{ headers }
				)
			) as VersionCompareActionResult;
			if (Object.keys(payload).length > 0) {
				return delay(mapCompareResult(payload));
			}
		} catch (error) {
			if (!(error instanceof TypeError) && !String(error).toLowerCase().includes('fetch')) {
				throw error;
			}
		}

		const [left, right] = await Promise.all([
			this.getVersion(leftVersionId),
			this.getVersion(rightVersionId)
		]);

		const toEntry = (serviceDefId: string, changeType: CompareVersionEntry['changeType']): CompareVersionEntry => ({
			serviceDefId,
			baseDetailId: left.id,
			compareDetailId: right.id,
			changeType
		});

		const leftLabel = left.metadata.entityTypes.join(', ') || left.versionNumber;
		const rightLabel = right.metadata.entityTypes.join(', ') || right.versionNumber;
		return delay({
			baseVersionId: left.id,
			compareVersionId: right.id,
			change: leftLabel === rightLabel ? [] : [toEntry(leftLabel, 'CHANGED')],
			differ: leftLabel === rightLabel ? [] : [toEntry(rightLabel, 'ADDED')],
			unchange: leftLabel === rightLabel ? [toEntry(leftLabel, 'UNCHANGED')] : []
		});
	}

	private async loadVersionsFromBackend(registryId: string): Promise<RegistryVersion[]> {
		const payload = await this.client.readJson(`/Registry/${formatGuidLiteral(registryId)}/_Version`);
		const versions = normalizeODataCollection(payload);
		return Promise.all(versions.map((entity) => this.loadVersionFromEntity(entity)));
	}

	private async loadVersionFromBackend(versionId: string): Promise<RegistryVersion | null> {
		const payload = await this.client.readJson(`/Version/${formatGuidLiteral(versionId)}`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return this.loadVersionFromEntity(entity);
	}

	private async loadVersionFromEntity(entity: Record<string, any>): Promise<RegistryVersion> {
		const versionId = asString(entity.VersionId) || asString(entity.id);
		let parsedDetail: { detailId: string; metadataXml: string } | undefined;
		try {
			const details = await this.detailService.getDetails(versionId);
			const primaryDetail = details[0];
			if (primaryDetail) {
				parsedDetail = await this.detailService.getParsedDetail(primaryDetail.id);
			}
		} catch {
			parsedDetail = undefined;
		}

		return mapVersionEntity(entity, parsedDetail);
	}
}
