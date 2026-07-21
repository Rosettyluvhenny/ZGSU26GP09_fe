import ODataClient from './ODataClient';

import type { LogEntry } from '../model/types';
import { mapLogEntity, normalizeODataCollection } from './ODataParsers';

export interface LogQueryFilter {
	jobId?: string;
	actionType?: string;
	logResult?: string;
	objectIdType?: string;
	dateFrom?: Date | null;
	dateTo?: Date | null;
	search?: string;
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

export default class LogService {
	private readonly client = new ODataClient();

	public async getLogs(filter: LogQueryFilter = {}): Promise<LogEntry[]> {
		const payload = await this.client.readJson(this.buildLogUrl(filter));
		return delay(normalizeODataCollection(payload).map((entity) => mapLogEntity(entity)));
	}

	/** @deprecated Use getLogs({ jobId }) instead */
	public async getLogsByJobId(jobId: string): Promise<LogEntry[]> {
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
			const term = escapeODataString(filter.search.trim());
			parts.push(`(contains(Remarks,'${term}') or contains(Actor,'${term}'))`);
		}

		const query: string[] = [];
		if (parts.length > 0) {
			query.push(`$filter=${encodeURIComponent(parts.join(' and '))}`);
		}
		query.push('$orderby=ActionAt desc');
		return `/Log?${query.join('&')}`;
	}
}
