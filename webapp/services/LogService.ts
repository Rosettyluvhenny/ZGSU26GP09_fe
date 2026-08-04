import ODataClient from './ODataClient';

import type { LogEntry } from '../model/types';
import { mapLogEntity, normalizeODataCollection } from './ODataParsers';

export const LOG_PAGE_SIZE = 50;

export interface LogQueryFilter {
	jobId?: string;
	actionType?: string;
	logResult?: string;
	objectIdType?: string;
	dateFrom?: Date | null;
	dateTo?: Date | null;
	search?: string;
	top?: number;
	skip?: number;
}

export interface LogPageResult {
	items: LogEntry[];
	totalCount: number;
	hasMore: boolean;
}

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}

function escapeODataString(value: string): string {
	return value.replace(/'/g, "''");
}

function toODataDateTime(date: Date): string {
	return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function readODataCount(payload: unknown, fallback: number): number {
	if (!payload || typeof payload !== 'object') {
		return fallback;
	}
	const record = payload as Record<string, unknown>;
	const raw = record['@odata.count'] ?? record['odata.count'] ?? record['__count'];
	const numeric = Number(raw);
	return Number.isFinite(numeric) ? numeric : fallback;
}

export default class LogService {
	private readonly client: ODataClient;
	constructor(model?: import("sap/ui/model/odata/v4/ODataModel").default) {
		this.client = new ODataClient(model);
	}

	public async getLogs(filter: LogQueryFilter = {}): Promise<LogPageResult> {
		const top = filter.top ?? LOG_PAGE_SIZE;
		const skip = filter.skip ?? 0;
		const payload = await this.client.readJson(this.buildLogUrl({ ...filter, top, skip }));
		const items = normalizeODataCollection(payload).map((entity) => mapLogEntity(entity));
		const totalCount = readODataCount(payload, skip + items.length);
		return delay({
			items,
			totalCount,
			hasMore: skip + items.length < totalCount && items.length > 0
		});
	}

	/** @deprecated Use getLogs({ jobId }) instead */
	public async getLogsByJobId(jobId: string): Promise<LogPageResult> {
		return this.getLogs({ jobId });
	}

	private buildLogUrl(filter: LogQueryFilter): string {
		const parts: string[] = [];

		if (filter.jobId) {
			const normalized = filter.jobId.replace(/[{}]/g, '').trim();
			parts.push(`JobId eq ${normalized}`);
		}
		if (filter.actionType && filter.actionType !== 'All') {
			parts.push(`ActionType eq '${escapeODataString(filter.actionType)}'`);
		}
		if (filter.logResult && filter.logResult !== 'All') {
			parts.push(`LogResult eq '${escapeODataString(filter.logResult)}'`);
		}
		if (filter.objectIdType && filter.objectIdType !== 'All') {
			parts.push(`objectIdType eq '${escapeODataString(filter.objectIdType)}'`);
		}
		if (filter.dateFrom) {
			const from = new Date(filter.dateFrom);
			from.setHours(0, 0, 0, 0);
			parts.push(`ActionAt ge ${toODataDateTime(from)}`);
		}
		if (filter.dateTo) {
			const to = new Date(filter.dateTo);
			to.setHours(23, 59, 59, 999);
			parts.push(`ActionAt le ${toODataDateTime(to)}`);
		}
		if (filter.search?.trim()) {
			const raw = filter.search.trim();
			const normalizedGuid = raw.replace(/[{}]/g, '');
			const looksLikeGuid = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/.test(normalizedGuid);
			const objectTypeTerm = raw.toUpperCase();
			const knownObjectTypes = ['REGISTRY', 'DETAIL', 'VERSION', 'SCANJOB'];
			if (looksLikeGuid) {
				parts.push(`ObjectId eq ${normalizedGuid}`);
			} else if (knownObjectTypes.includes(objectTypeTerm)) {
				// Avoid duplicating objectIdType filter when the dropdown already selected the same value.
				if (!filter.objectIdType || filter.objectIdType === 'All' || filter.objectIdType.toUpperCase() !== objectTypeTerm) {
					parts.push(`objectIdType eq '${escapeODataString(objectTypeTerm)}'`);
				}
			} else {
				const term = escapeODataString(raw);
				parts.push(`(contains(Remarks,'${term}') or contains(Actor,'${term}'))`);
			}
		}

		const query: string[] = [];
		if (parts.length > 0) {
			query.push(`$filter=${encodeURIComponent(parts.join(' and '))}`);
		}
		query.push('$orderby=ActionAt desc');
		query.push(`$top=${filter.top ?? LOG_PAGE_SIZE}`);
		query.push(`$skip=${filter.skip ?? 0}`);
		query.push('$count=true');
		return `/Log?${query.join('&')}`;
	}
}

