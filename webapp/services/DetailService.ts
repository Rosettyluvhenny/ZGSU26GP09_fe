import type ODataModel from 'sap/ui/model/odata/v4/ODataModel';
import { createODataClient } from './ODataClient';
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
	private readonly odata: ReturnType<typeof createODataClient>;

	constructor(model: ODataModel) {
		this.odata = createODataClient(model);
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
		const payload = await this.odata.callAction(
			'com.sap.gateway.srvd_a2x.zsr_registry.v0001.getNodeTree(...)',
			{
				context: this.odata.getHeaderContext('/Detail'),
				parameters: { DetailId: detailId }
			}
		) as unknown as Record<string, unknown>;

		const results = payload?.value || payload?.NODETREE || payload?.NodeTree || payload?.nodeTree || payload;
		if (Array.isArray(results)) {
			return results.map(mapNodeTreeItem);
		}
		return [] as nodeTreeResponseItem[];
	}

	public async compareNodeTree(baseDetailId: string, compareDetailId: string): Promise<nodeDiffEntry[]> {
		const payload = await this.odata.callAction(
			'com.sap.gateway.srvd_a2x.zsr_registry.v0001.compareNodeTree(...)',
			{
				context: this.odata.getHeaderContext('/Detail'),
				parameters: {
					BaseDetailId: baseDetailId,
					CompareDetailId: compareDetailId
				}
			}
		) as unknown as Record<string, unknown>;

		const results = payload?.value || payload?.NODEDIFF || payload?.NodeDiff || payload?.nodeDiff || payload;
		if (Array.isArray(results)) {
			return results.map(mapNodeDiffItem);
		}
		return [] as nodeDiffEntry[];
	}

	private async loadDetailsFromBackend(versionId: string): Promise<registryDetail[]> {
		const entities = await this.odata.readList(`/Version(VersionId=${formatGuidLiteral(versionId)})/_Detail`);
		return entities.map((entity) => mapDetailEntity(entity as Record<string, unknown>));
	}

	private async loadDetailFromBackend(detailId: string): Promise<registryDetail | null> {
		const entity = await this.odata.readOne(`/Detail/${formatGuidLiteral(detailId)}`);
		if (!entity) {
			return null;
		}

		return mapDetailEntity(entity as Record<string, unknown>);
	}

	private async loadParsedMetadataFromBackend(detailId: string): Promise<detailMetadataResult | null> {
		const entity = await this.odata.callAction<Record<string, unknown>>(
			'com.sap.gateway.srvd_a2x.zsr_registry.v0001.getParseMetadata(...)',
			{
				context: this.odata.getHeaderContext('/Detail'),
				parameters: { DetailId: detailId }
			}
		);
		if (!entity || !Object.keys(entity).length) {
			return null;
		}

		return {
			detailId: asString(entity.DetailId) || detailId,
			metadataXml: asString(entity.MetadataXml) || asString(entity.metadataXml)
		};
	}

	public async sendEmail(params: sendMailParams): Promise<sendMailResult> {
		const entity = await this.odata.callAction<Record<string, unknown>>(
			'com.sap.gateway.srvd_a2x.zsr_registry.v0001.sendEmail(...)',
			{
				context: this.odata.getHeaderContext('/Detail'),
				parameters: {
					HtmlContent: params.htmlContent,
					Recipients: params.recipients,
					Subject: params.subject
				}
			}
		);
		// Backend returns PascalCase per ZI_EMAIL_SEND_RESULT complex type
		return {
			success: !!(entity.Success ?? entity.success),
			message: asString(entity.Message ?? entity.message),
			failedRecip: asString(entity.FailedRecip ?? entity.failedRecip),
			recipientDetail: asString(entity.RecipientDetail ?? entity.recipientDetail)
		};
	}


	public async exportSchema(xml: string, format: string): Promise<{ blob: Blob, isZip: boolean }> {
		console.log(`[ExportSchema] Sending XML payload of length ${xml.length} for format: ${format}`);
		
		const response = await fetch(`/convert/${format}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/xml'
			},
			body: xml
		});
		
		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Export failed: ${response.status} ${text}`);
		}
		
		const contentType = response.headers.get('Content-Type') || '';
		const isZip = contentType.includes('zip') || format === 'ts';
		const rawBlob = await response.blob();
		
		return {
			blob: isZip ? new Blob([rawBlob], { type: 'application/zip' }) : rawBlob,
			isZip
		};
	}

}

