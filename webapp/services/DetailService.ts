import ODataClient from './ODataClient';
import ServiceError from './ServiceError';
import { readMockData } from './MockStore';
import type { DetailMetadataResult, NodeDiffActionResult, NodeDiffEntry, NodeTreeActionResult, NodeTreeResponseItem, RegistryDetail, RegistryVersion } from '../model/types';
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

function asString(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	return String(value);
}

function asNumber(value: unknown): number {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : 0;
}

function mapNodeTreeItem(item: Record<string, any>): NodeTreeResponseItem {
	return {
		nodeId: asString(item.NODE_ID),
		semanticId: asString(item.SEMANTIC_ID),
		parentId: asString(item.PARENT_ID),
		nodePath: asString(item.NODE_PATH),
		nodeType: asString(item.NODE_TYPE),
		nodeName: asString(item.NODE_NAME),
		nodeAlias: asString(item.NODE_ALIAS),
		offsetStart: asNumber(item.OFFSET_START),
		offsetEnd: asNumber(item.OFFSET_END),
		seq: asNumber(item.SEQ),
		depth: asNumber(item.DEPTH),
		attributes: Array.isArray(item.ATTRIBUTES)
			? item.ATTRIBUTES.map((attribute: Record<string, any>) => ({
				name: asString(attribute.NAME),
				value: asString(attribute.VALUE)
			}))
			: []
	};
}

function mapNodeDiffItem(item: Record<string, any>): NodeDiffEntry {
	return {
		SEMANTIC_ID: asString(item.SEMANTIC_ID),
		STATUS: asString(item.STATUS),
		ATTRIBUTEDIFF: Array.isArray(item.ATTRIBUTEDIFF)
			? item.ATTRIBUTEDIFF.map((attribute: Record<string, any>) => ({
				SEMANTIC_ID: asString(attribute.SEMANTIC_ID),
				NAME: asString(attribute.NAME),
				STATUS: asString(attribute.STATUS),
				OLD_VALUE: asString(attribute.OLD_VALUE),
				NEW_VALUE: asString(attribute.NEW_VALUE)
			}))
			: []
	};
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

	public async getNodeTree(detailId: string): Promise<NodeTreeResponseItem[]> {
		try {
			const payload = normalizeODataEntity(
				await this.client.postJson(
					`/Detail/${formatGuidLiteral(detailId)}/com.sap.gateway.srvd_a2x.zsr_registry.v0001.getNodeTree`,
					undefined,
					{ headers: await this.client.ensureWriteHeaders('POST') }
				)
			) as NodeTreeActionResult;
			if (Array.isArray(payload.NODETREE)) {
				return delay(payload.NODETREE.map(mapNodeTreeItem));
			}
		} catch {
			// Fall back to the raw detail XML if the backend action is not available.
		}

		const detail = await this.getDetail(detailId);
		return delay([
			{
				nodeId: detail.id,
				semanticId: detail.serviceDefinition || detail.id,
				parentId: '',
				nodePath: '1',
				nodeType: 'Detail',
				nodeName: detail.serviceDefinition || 'Detail',
				nodeAlias: '',
				offsetStart: 0,
				offsetEnd: detail.xml.length,
				seq: 1,
				depth: 0,
				attributes: []
			}
		]);
	}

	public async compareNodeTree(baseDetailId: string, compareDetailId: string): Promise<NodeDiffEntry[]> {
		try {
			const payload = normalizeODataEntity(
				await this.client.postJson(
					'/Detail/com.sap.gateway.srvd_a2x.zsr_registry.v0001.compareNodeTree',
					{
						base_detail_id: baseDetailId,
						compare_detail_id: compareDetailId
					},
					{ headers: await this.client.ensureWriteHeaders('POST') }
				)
			) as NodeDiffActionResult;
			if (Array.isArray(payload.NODEDIFF)) {
				return delay(payload.NODEDIFF.map(mapNodeDiffItem));
			}
		} catch {
			// Fall back to an empty diff for local/mock usage.
		}

		return delay([]);
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
			undefined,
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
