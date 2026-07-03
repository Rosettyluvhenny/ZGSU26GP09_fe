import ODataClient from './ODataClient';
import ServiceError from './ServiceError';
import { readMockData, writeMockData } from './MockStore';
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
		await this.client.ensureWriteHeaders('POST');
		const data = readMockData();
		const startedAt = new Date().toISOString();
		const finishedAt = new Date(Date.now() + 4 * 60 * 1000).toISOString();
		const job: Job = {
			id: `job-${Date.now().toString(36)}`,
			registryId,
			registryName,
			status: 'Completed',
			startedAt,
			finishedAt,
			durationMs: 4 * 60 * 1000,
			executedBy,
			logs: [
				`[INFO] Manual scan started for ${registryName}`,
				'[INFO] Metadata pulled from service definition',
				'[INFO] Scan completed successfully'
			],
			errorMessage: '',
			summary: 'Manual scan completed successfully.'
		};

		data.jobs.unshift(job);
		writeMockData(data);
		return delay(cloneJob(job), 400);
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

