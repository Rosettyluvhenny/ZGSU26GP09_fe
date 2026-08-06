import type ODataModel from 'sap/ui/model/odata/v4/ODataModel';
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';

import { createODataClient } from './ODataClient';

import type { logEntry } from '../model/types';
import { mapLogEntity } from './ODataParsers';

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
	items: logEntry[];
	totalCount: number;
	hasMore: boolean;
}

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}

function normalizeGuid(value: string): string {
	return value.replace(/[{}]/g, '').trim();
}

function toODataDateTime(date: Date): string {
	return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export default class LogService {
	private readonly odata: ReturnType<typeof createODataClient>;

	constructor(model: ODataModel) {
		this.odata = createODataClient(model);
	}

	public async getLogs(filter: LogQueryFilter = {}): Promise<LogPageResult> {
		const top = filter.top ?? LOG_PAGE_SIZE;
		const skip = filter.skip ?? 0;

		const { items: entities, count } = await this.odata.readListWithCount('/Log', {
			filters: this.buildLogFilters(filter),
			parameters: { '$orderby': 'ActionAt desc' },
			top,
			skip
		});

		const items = entities.map((entity) => mapLogEntity(entity));
		const totalCount = Number.isFinite(count) ? count : skip + items.length;

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

	private buildLogFilters(filter: LogQueryFilter): Filter[] {
		const filters: Filter[] = [];

		if (filter.jobId) {
			filters.push(new Filter('JobId', FilterOperator.EQ, normalizeGuid(filter.jobId)));
		}
		if (filter.actionType && filter.actionType !== 'All') {
			filters.push(new Filter('ActionType', FilterOperator.EQ, filter.actionType));
		}
		if (filter.logResult && filter.logResult !== 'All') {
			filters.push(new Filter('LogResult', FilterOperator.EQ, filter.logResult));
		}
		if (filter.objectIdType && filter.objectIdType !== 'All') {
			filters.push(new Filter('objectIdType', FilterOperator.EQ, filter.objectIdType));
		}
		if (filter.dateFrom) {
			const from = new Date(filter.dateFrom);
			from.setHours(0, 0, 0, 0);
			filters.push(new Filter('ActionAt', FilterOperator.GE, toODataDateTime(from)));
		}
		if (filter.dateTo) {
			const to = new Date(filter.dateTo);
			to.setHours(23, 59, 59, 999);
			filters.push(new Filter('ActionAt', FilterOperator.LE, toODataDateTime(to)));
		}

		if (filter.search?.trim()) {
			const raw = filter.search.trim();
			const normalizedGuid = raw.replace(/[{}]/g, '');
			const looksLikeGuid = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/.test(normalizedGuid);
			const objectTypeTerm = raw.toUpperCase();
			const knownObjectTypes = ['REGISTRY', 'DETAIL', 'VERSION', 'SCANJOB'];

			if (looksLikeGuid) {
				filters.push(new Filter('ObjectId', FilterOperator.EQ, normalizedGuid));
			} else if (knownObjectTypes.includes(objectTypeTerm)) {
				// Avoid duplicating objectIdType filter when the dropdown already selected the same value.
				if (!filter.objectIdType || filter.objectIdType === 'All' || filter.objectIdType.toUpperCase() !== objectTypeTerm) {
					filters.push(new Filter('objectIdType', FilterOperator.EQ, objectTypeTerm));
				}
			} else {
				filters.push(
					new Filter({
						filters: [
							new Filter('Remarks', FilterOperator.Contains, raw),
							new Filter('Actor', FilterOperator.Contains, raw)
						],
						and: false
					})
				);
			}
		}

		return filters;
	}
}