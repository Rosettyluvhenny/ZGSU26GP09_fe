import ODataClient from './ODataClient';
import ServiceError from './ServiceError';

import type { detailMetadataResult, nodeDiffActionResult, nodeDiffEntry, nodeTreeActionResult, nodeTreeResponseItem, registryDetail, sendMailParams, sendMailResult } from '../model/types';
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

function mapNodeTreeItem(item: Record<string, unknown>): nodeTreeResponseItem {
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

function mapNodeDiffItem(item: Record<string, unknown>): nodeDiffEntry {
	return {
		semanticId: asString(item.SEMANTIC_ID),
		status: asString(item.STATUS),
		attributeDiff: Array.isArray(item.ATTRIBUTEDIFF)
			? item.ATTRIBUTEDIFF.map((attribute: Record<string, unknown>) => ({
				semanticId: asString(attribute.SEMANTIC_ID),
				name: asString(attribute.NAME),
				status: asString(attribute.STATUS),
				oldValue: asString(attribute.OLD_VALUE),
				newValue: asString(attribute.NEW_VALUE)
			}))
			: []
	};
}



export default class DetailService {
	private readonly client: ODataClient;
	constructor(model?: import("sap/ui/model/odata/v4/ODataModel").default) {
		this.client = new ODataClient(model);
	}

	public async getDetails(versionId: string): Promise<registryDetail[]> {
		return this.loadDetailsFromBackend(versionId);
	}

	public async getDetail(detailId: string): Promise<registryDetail> {
		const backendDetail = await this.loadDetailFromBackend(detailId);
		if (!backendDetail) {
			throw new ServiceError(404, 'Detail not found.');
		}
		return backendDetail;
	}

	public async getParsedDetail(detailId: string): Promise<detailMetadataResult> {
		const parsedDetail = await this.loadParsedMetadataFromBackend(detailId);
		if (parsedDetail) {
			return parsedDetail;
		}
		const detail = await this.getDetail(detailId);
		return { detailId: detail.detailId, metadataXml: detail.metadataXml };
	}

	public async getNodeTree(detailId: string): Promise<nodeTreeResponseItem[]> {
		const payload = normalizeODataEntity(
			await this.client.postJson(
				`/Detail/com.sap.gateway.srvd_a2x.zsr_registry.v0001.getNodeTree`,
				{ DetailId: detailId },
				{ headers: await this.client.ensureWriteHeaders('POST') }
			)
		) as unknown as nodeTreeActionResult;
		if (Array.isArray(payload.nodeTree)) {
			return payload.nodeTree.map(mapNodeTreeItem);
		}
		return [] as nodeTreeResponseItem[];
	}

	public async compareNodeTree(baseDetailId: string, compareDetailId: string): Promise<nodeDiffEntry[]> {
		const payload = normalizeODataEntity(
			await this.client.postJson(
				'/Detail/com.sap.gateway.srvd_a2x.zsr_registry.v0001.compareNodeTree',
				{
					BaseDetailId: baseDetailId,
					CompareDetailId: compareDetailId
				},
				{ headers: await this.client.ensureWriteHeaders('POST') }
			)
		) as unknown as nodeDiffActionResult;
		if (Array.isArray(payload.nodeDiff)) {
			return payload.nodeDiff.map(mapNodeDiffItem);
		}
		return [] as nodeDiffEntry[];
	}

	private async loadDetailsFromBackend(versionId: string): Promise<registryDetail[]> {
		const payload = await this.client.readJson(`/Version(VersionId=${formatGuidLiteral(versionId)})/_Detail`);
		return normalizeODataCollection(payload).map((entity) => mapDetailEntity(entity));
	}

	private async loadDetailFromBackend(detailId: string): Promise<registryDetail | null> {
		const payload = await this.client.readJson(`/Detail/${formatGuidLiteral(detailId)}`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return mapDetailEntity(entity);
	}

	private async loadParsedMetadataFromBackend(detailId: string): Promise<detailMetadataResult | null> {
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

	public async sendEmail(params: sendMailParams): Promise<sendMailResult> {
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

