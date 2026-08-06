import ODataClient from './ODataClient';

import type { LogEntry } from '../model/types';
import { mapLogEntity, normalizeODataCollection } from './ODataParsers';

export interface ActionTypeOption {
	key: string;
	text: string;
}

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

/** Safe stringify for OData VH fields (ActionId / Description are Edm.String). */
function asString(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}
	return '';
}

function toODataDateTime(date: Date): string {
	return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Normalize to `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` or null if not a full GUID. */
function normalizeGuidLiteral(raw: string): string | null {
	const hex = raw.replace(/[{}\s-]/g, '');
	if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
		return null;
	}
	const h = hex.toLowerCase();
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
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
	private readonly client = new ODataClient();

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

	/**
	 * Fetches all valid action types from the value-help entity ZI_LOG_ACT_TYPE_VH.
	 * Schema: { ActionId: string (2), Description: string (20) }
	 * Returns [{key, text}] ready for the Action filter Select.
	 */
	public async getActionTypeOptions(): Promise<ActionTypeOption[]> {
		const payload = await this.client.readJson('/ZI_LOG_ACT_TYPE_VH');
		return normalizeODataCollection(payload)
			.map((record) => {
				const key = asString(record.ActionId);
				const text = asString(record.Description) || key;
				return { key, text };
			})
			.filter((opt) => opt.key.length > 0);
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
			const guid = normalizeGuidLiteral(raw);
			const objectTypeTerm = raw.toUpperCase();
			const knownObjectTypes = ['REGISTRY', 'DETAIL', 'VERSION', 'SCANJOB', 'JOB'];
			if (guid) {
				// ObjectId / LogId are Edm.Guid — only exact eq is supported (not contains).
				parts.push(`(ObjectId eq ${guid} or LogId eq ${guid})`);
			} else if (knownObjectTypes.includes(objectTypeTerm)) {
				// Avoid duplicating objectIdType filter when the dropdown already selected the same value.
				if (!filter.objectIdType || filter.objectIdType === 'All' || filter.objectIdType.toUpperCase() !== objectTypeTerm) {
					parts.push(`objectIdType eq '${escapeODataString(objectTypeTerm)}'`);
				}
			} else {
				const term = escapeODataString(raw);
				const upper = escapeODataString(raw.toUpperCase());
				parts.push(
					'(' +
						[
							`contains(Remarks,'${term}')`,
							`contains(Actor,'${term}')`,
							`contains(ActionText,'${term}')`,
							`contains(LogResult,'${upper}')`,
							`contains(ActionType,'${upper}')`,
							`contains(objectIdType,'${upper}')`,
							`contains(IpAddress,'${term}')`
						].join(' or ') +
						')'
				);
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
