import ODataClient from './ODataClient';
import ServiceError from './ServiceError';

import type { Job } from '../model/types';
import { mapJobEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}


export default class JobService {
	private readonly client = new ODataClient();

	public async getJobs(search = ''): Promise<Job[]> {
		const backendJobs = await this.loadJobsFromBackend();
		return delay(this.filterJobs(backendJobs, search));
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

	private async loadJobsFromBackend(): Promise<Job[]> {
		const payload = await this.client.readJson('/ScanJob?$orderby=StartedAt desc');
		return normalizeODataCollection(payload).map((entity) => mapJobEntity(entity));
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

