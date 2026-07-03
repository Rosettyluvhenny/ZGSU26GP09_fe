import ODataClient from './ODataClient';
import ServiceError from './ServiceError';
import { readMockData } from './MockStore';
import type { DetailMetadataResult, RegistryDetail, RegistryVersion } from '../model/types';
import { mapDetailEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

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

function createMockDetail(registryId: string, serviceDefinition: string, version: RegistryVersion): RegistryDetail {
	return {
		id: `${version.id}-detail`,
		versionId: version.id,
		groupId: registryId,
		serviceDefinition,
		serviceHash: version.comment,
		lastChangedAt: version.createdAt,
		xml: version.xml
	};
}

export default class DetailService {
	private readonly client = new ODataClient();

	public async getDetails(versionId: string): Promise<RegistryDetail[]> {
		try {
			const backendDetails = await this.loadDetailsFromBackend(versionId);
			if (backendDetails.length > 0) {
				return delay(backendDetails);
			}
		} catch {
			// Fall back to mock data below.
		}

		const detail = this.loadMockDetailForVersion(versionId);
		if (!detail) {
			throw new ServiceError(404, 'Version not found.');
		}

		return delay([detail]);
	}

	public async getDetail(detailId: string): Promise<RegistryDetail> {
		try {
			const backendDetail = await this.loadDetailFromBackend(detailId);
			if (backendDetail) {
				return delay(backendDetail);
			}
		} catch {
			// Fall back to mock data below.
		}

		const detail = this.findMockDetail(detailId);
		if (!detail) {
			throw new ServiceError(404, 'Detail not found.');
		}

		return delay(JSON.parse(JSON.stringify(detail)) as RegistryDetail);
	}

	public async getParsedDetail(detailId: string): Promise<DetailMetadataResult> {
		try {
			const parsedDetail = await this.loadParsedMetadataFromBackend(detailId);
			if (parsedDetail) {
				return delay(parsedDetail);
			}
		} catch {
			// Fall back to mock data below.
		}

		const detail = await this.getDetail(detailId);
		return delay({ detailId: detail.id, metadataXml: detail.xml });
	}

	private async loadDetailsFromBackend(versionId: string): Promise<RegistryDetail[]> {
		const payload = await this.client.readJson(`/Version(VersionId=${formatGuidLiteral(versionId)})/_Detail`);
		return normalizeODataCollection(payload).map((entity) => mapDetailEntity(entity));
	}

	private async loadDetailFromBackend(detailId: string): Promise<RegistryDetail | null> {
		const payload = await this.client.readJson(`/Detail/${formatGuidLiteral(detailId)}`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return mapDetailEntity(entity);
	}

	private async loadParsedMetadataFromBackend(detailId: string): Promise<DetailMetadataResult | null> {
		const payload = await this.client.postJson(
			`/Detail/${formatGuidLiteral(detailId)}/com.sap.gateway.srvd_a2x.zsr_registry.v0001.getParseMetadata`,
			{},
			{ headers: await this.client.ensureWriteHeaders('POST') }
		);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return {
			detailId: String(entity.DetailId ?? detailId),
			metadataXml: String(entity.MetadataXml ?? entity.metadataXml ?? '')
		};
	}

	private loadMockDetailForVersion(versionId: string): RegistryDetail | null {
		const data = readMockData();
		for (const registry of data.registries) {
			const version = registry.versions.find((item) => item.id === versionId);
			if (version) {
				return createMockDetail(registry.id, registry.serviceDefinition, version);
			}
		}

		return null;
	}

	private findMockDetail(detailId: string): RegistryDetail | null {
		const data = readMockData();
		for (const registry of data.registries) {
			for (const version of registry.versions) {
				if (`${version.id}-detail` === detailId) {
					return createMockDetail(registry.id, registry.serviceDefinition, version);
				}
			}
		}

		return null;
	}
}
