import ODataClient from './ODataClient';
import ServiceError from './ServiceError';

import type { DetailMetadataResult, NodeDiffActionResult, NodeDiffEntry, NodeTreeActionResult, NodeTreeResponseItem, RegistryDetail, SendMailParams, SendMailResult } from '../model/types';
import { mapDetailEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

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

function asNumber(value: unknown): number {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : 0;
}

function mapNodeTreeItem(item: Record<string, unknown>): NodeTreeResponseItem {
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
			? item.ATTRIBUTES.map((attribute: Record<string, unknown>) => ({
				name: asString(attribute.NAME),
				value: asString(attribute.VALUE)
			}))
			: []
	};
}

function mapNodeDiffItem(item: Record<string, unknown>): NodeDiffEntry {
	return {
		SEMANTIC_ID: asString(item.SEMANTIC_ID),
		STATUS: asString(item.STATUS),
		ATTRIBUTEDIFF: Array.isArray(item.ATTRIBUTEDIFF)
			? item.ATTRIBUTEDIFF.map((attribute: Record<string, unknown>) => ({
				SEMANTIC_ID: asString(attribute.SEMANTIC_ID),
				NAME: asString(attribute.NAME),
				STATUS: asString(attribute.STATUS),
				OLD_VALUE: asString(attribute.OLD_VALUE),
				NEW_VALUE: asString(attribute.NEW_VALUE)
			}))
			: []
	};
}



export default class DetailService {
	private readonly client: ODataClient;
	constructor(model?: import("sap/ui/model/odata/v4/ODataModel").default) {
		this.client = new ODataClient(model);
	}

	public async getDetails(versionId: string): Promise<RegistryDetail[]> {
		return this.loadDetailsFromBackend(versionId);
	}

	public async getDetail(detailId: string): Promise<RegistryDetail> {
		const backendDetail = await this.loadDetailFromBackend(detailId);
		if (!backendDetail) {
			throw new ServiceError(404, 'Detail not found.');
		}
		return backendDetail;
	}

	public async getParsedDetail(detailId: string): Promise<DetailMetadataResult> {
		const parsedDetail = await this.loadParsedMetadataFromBackend(detailId);
		if (parsedDetail) {
			return parsedDetail;
		}
		const detail = await this.getDetail(detailId);
		return { detailId: detail.id, metadataXml: detail.xml };
	}

	public async getNodeTree(detailId: string): Promise<NodeTreeResponseItem[]> {
		const payload = normalizeODataEntity(
			await this.client.postJson(
				`/Detail/com.sap.gateway.srvd_a2x.zsr_registry.v0001.getNodeTree`,
				{ DetailId: detailId },
				{ headers: await this.client.ensureWriteHeaders('POST') }
			)
		) as unknown as NodeTreeActionResult;
		if (Array.isArray(payload.NODETREE)) {
			return payload.NODETREE.map(mapNodeTreeItem);
		}
		return [] as NodeTreeResponseItem[];
	}

	public async compareNodeTree(baseDetailId: string, compareDetailId: string): Promise<NodeDiffEntry[]> {
		const payload = normalizeODataEntity(
			await this.client.postJson(
				'/Detail/com.sap.gateway.srvd_a2x.zsr_registry.v0001.compareNodeTree',
				{
					BaseDetailId: baseDetailId,
					CompareDetailId: compareDetailId
				},
				{ headers: await this.client.ensureWriteHeaders('POST') }
			)
		) as unknown as NodeDiffActionResult;
		if (Array.isArray(payload.NODEDIFF)) {
			return payload.NODEDIFF.map(mapNodeDiffItem);
		}
		return [] as NodeDiffEntry[];
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
			`/Detail/com.sap.gateway.srvd_a2x.zsr_registry.v0001.getParseMetadata`,
			{ DetailId: detailId },
			{ headers: await this.client.ensureWriteHeaders('POST') }
		);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return {
			detailId: asString(entity.DetailId) || detailId,
			metadataXml: asString(entity.MetadataXml) || asString(entity.metadataXml)
		};
	}

	public async sendEmail(params: SendMailParams): Promise<SendMailResult> {
		const raw = await this.client.postJson(
			'/Detail/com.sap.gateway.srvd_a2x.zsr_registry.v0001.sendEmail',
			{
				HtmlContent: params.htmlContent,
				Recipients: params.recipients,
				Subject: params.subject
			},
			{ headers: await this.client.ensureWriteHeaders('POST') }
		);
		const entity = normalizeODataEntity(raw);
		// Backend returns PascalCase per ZI_EMAIL_SEND_RESULT complex type
		return {
			success: !!(entity.Success ?? entity.success),
			message: asString(entity.Message ?? entity.message),
			failedRecip: asString(entity.FailedRecip ?? entity.failedRecip),
			recipientDetail: asString(entity.RecipientDetail ?? entity.recipientDetail)
		};
	}


}

