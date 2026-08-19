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


export default class JobService {
	private readonly client = new ODataClient();

	public async getJobs(filter: { search?: string; top?: number; skip?: number } = {}): Promise<JobPageResult> {
		const top = filter.top ?? JOB_PAGE_SIZE;
		const skip = filter.skip ?? 0;
		const { payload, items: allItems } = await this.loadJobsFromBackend(top, skip);
		const items = this.filterJobs(allItems, filter.search ?? '');
		const totalCount = readODataCount(payload, skip + allItems.length);
		return delay({
			items,
			totalCount,
			hasMore: skip + allItems.length < totalCount && allItems.length > 0
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

	private filterJobs(jobs: Job[], search: string): Job[] {
		const normalized = search.trim().toLowerCase();
		const filtered = jobs.filter((job) => {
			if (!normalized) {
				return true;
			}

			return [job.id, job.triggerType, job.status, job.executedBy, job.summary].join(' ').toLowerCase().includes(normalized);
		});
		return filtered;
	}

	private async loadJobsFromBackend(top: number, skip: number): Promise<{ payload: unknown; items: Job[] }> {
		const url = `/ScanJob?$orderby=StartedAt desc&$top=${top}&$skip=${skip}&$count=true`;
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

