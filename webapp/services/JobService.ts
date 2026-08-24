import ODataClient from './ODataClient';
import ServiceError from './ServiceError';

import type { Job } from '../model/types';
import { mapJobEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

export const JOB_PAGE_SIZE = 50;

export interface JobPageResult {
	items: Job[];
	totalCount: number;
	hasMore: boolean;
}

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
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

function escapeODataString(value: string): string {
	return value.replace(/'/g, "''");
}

/** Normalises any GUID variant to `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` or null. */
function normalizeGuidLiteral(raw: string): string | null {
	const hex = raw.replace(/[{}\s-]/g, '');
	if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
		return null;
	}
	const h = hex.toLowerCase();
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default class JobService {
	private readonly client = new ODataClient();

	public async getJobs(filter: { search?: string; triggerType?: string; status?: string; top?: number; skip?: number } = {}): Promise<JobPageResult> {
		const top = filter.top ?? JOB_PAGE_SIZE;
		const skip = filter.skip ?? 0;
		const { payload, items } = await this.loadJobsFromBackend(top, skip, filter.search, filter.triggerType, filter.status);
		const totalCount = readODataCount(payload, skip + items.length);
		return delay({
			items,
			totalCount,
			hasMore: skip + items.length < totalCount && items.length > 0
		});
	}

	public async getJob(jobId: string): Promise<Job> {
		const backendJob = await this.loadJobFromBackend(jobId);
		if (!backendJob) {
			throw new ServiceError(404, 'Job not found.');
		}

		return delay(backendJob);
	}

	public async runScanJob(): Promise<Job> {
		const headers = await this.client.ensureWriteHeaders('POST');
		const payload = await this.client.postJson(
			'/ScanJob/com.sap.gateway.srvd_a2x.zsr_registry.v0001.runScan',
			undefined,
			{ headers }
		);

		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			throw new ServiceError(500, 'Invalid response from runScan action.');
		}

		return delay(mapJobEntity(entity));
	}

	private async loadJobsFromBackend(top: number, skip: number, search?: string, triggerType?: string, status?: string): Promise<{ payload: unknown; items: Job[] }> {
		const query: string[] = [
			`$orderby=StartedAt desc`,
			`$top=${top}`,
			`$skip=${skip}`,
			`$count=true`
		];

		const filterParts: string[] = [];

		if (triggerType && triggerType !== 'All') {
			filterParts.push(`TriggerType eq '${escapeODataString(triggerType)}'`);
		}

		if (status && status !== 'All') {
			filterParts.push(`Status eq '${escapeODataString(status)}'`);
		}

		if (search?.trim()) {
			const raw = search.trim();
			const guid = normalizeGuidLiteral(raw);

			if (guid) {
				// ScanJobId is Edm.Guid — only exact eq is supported, not contains.
				filterParts.push(`ScanJobId eq ${guid}`);
			} else {
				const term = escapeODataString(raw);
				filterParts.push(`contains(TriggeredBy,'${term}')`);
			}
		}

		if (filterParts.length > 0) {
			query.push(`$filter=${encodeURIComponent(filterParts.join(' and '))}`);
		}

		const url = `/ScanJob?${query.join('&')}`;
		const payload = await this.client.readJson(url);
		const items = normalizeODataCollection(payload).map((entity) => mapJobEntity(entity));
		return { payload, items };
	}

	private async loadJobFromBackend(jobId: string): Promise<Job | null> {
		const payload = await this.client.readJson(`/ScanJob(${jobId})`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return mapJobEntity(entity);
	}
}

