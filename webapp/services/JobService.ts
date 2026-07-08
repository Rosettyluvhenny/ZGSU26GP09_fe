import ODataClient from './ODataClient';
import ServiceError from './ServiceError';

import type { Job } from '../model/types';
import { mapJobEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}

function cloneJob(job: Job): Job {
	return JSON.parse(JSON.stringify(job)) as Job;
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

	public async runScanJob(registryId: string, registryName: string, executedBy = 'demo.user'): Promise<Job> {
		throw new ServiceError(501, 'runScanJob is not implemented on the backend.');
	}

	private filterJobs(jobs: Job[], search: string): Job[] {
		const normalized = search.trim().toLowerCase();
		const filtered = jobs.filter((job) => {
			if (!normalized) {
				return true;
			}

			return [job.id, job.registryName, job.status, job.executedBy, job.summary].join(' ').toLowerCase().includes(normalized);
		});
		return filtered;
	}

	private async loadJobsFromBackend(): Promise<Job[]> {
		const payload = await this.client.readJson('/ScanJob');
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

