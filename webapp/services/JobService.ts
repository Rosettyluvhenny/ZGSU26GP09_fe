import ODataClient from './ODataClient';
import ServiceError from './ServiceError';

import type { job } from '../model/types';
import { mapJobEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}


export default class JobService {
	private readonly client: ODataClient;
	constructor(model?: import("sap/ui/model/odata/v4/ODataModel").default) {
		this.client = new ODataClient(model);
	}

	public async getJobs(search = ''): Promise<job[]> {
		const backendJobs = await this.loadJobsFromBackend();
		return delay(this.filterJobs(backendJobs, search));
	}

	public async getJob(jobId: string): Promise<job> {
		const backendJob = await this.loadJobFromBackend(jobId);
		if (!backendJob) {
			throw new ServiceError(404, 'Job not found.');
		}

		return delay(backendJob);
	}

	public async runScanJob(): Promise<job> {
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

	private filterJobs(jobs: job[], search: string): job[] {
		const normalized = search.trim().toLowerCase();
		const filtered = jobs.filter((job) => {
			if (!normalized) {
				return true;
			}

			return [job.scanJobId, job.triggerType, job.status, job.triggeredBy, job.summary].join(' ').toLowerCase().includes(normalized);
		});
		return filtered;
	}

	private async loadJobsFromBackend(): Promise<job[]> {
		const payload = await this.client.readJson('/ScanJob?$orderby=StartedAt desc');
		return normalizeODataCollection(payload).map((entity) => mapJobEntity(entity));
	}

	private async loadJobFromBackend(jobId: string): Promise<job | null> {
		const payload = await this.client.readJson(`/ScanJob(${jobId})`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return mapJobEntity(entity);
	}
}


