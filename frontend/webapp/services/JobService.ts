import type ODataModel from 'sap/ui/model/odata/v4/ODataModel';
import Sorter from 'sap/ui/model/Sorter';

import ServiceError from './ServiceError';
import { createODataClient } from './ODataClient';

import type { job } from '../model/types';
import { mapJobEntity } from './ODataParsers';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}

function normalizeGuid(value: string): string {
	return value.replace(/[{}]/g, '').trim();
}

export default class JobService {
	private readonly odata: ReturnType<typeof createODataClient>;

	constructor(model: ODataModel) {
		this.odata = createODataClient(model);
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
		// runScan is bound to the ScanJob collection (no key in the path) ->
		// bind the action to the list binding's header context.
		const oHeaderContext = this.odata.getHeaderContext('/ScanJob');

		const entity = await this.odata.callAction(
			'com.sap.gateway.srvd_a2x.zsr_registry.v0001.runScan(...)',
			{ context: oHeaderContext }
		);

		if (!entity || !Object.keys(entity).length) {
			throw new ServiceError(500, 'Invalid response from runScan action.');
		}

		return delay(mapJobEntity(entity));
	}

	private filterJobs(jobs: job[], search: string): job[] {
		const normalized = search.trim().toLowerCase();
		const filtered = jobs.filter((jobItem) => {
			if (!normalized) {
				return true;
			}

			return [jobItem.scanJobId, jobItem.triggerType, jobItem.status, jobItem.triggeredBy, jobItem.summary]
				.join(' ')
				.toLowerCase()
				.includes(normalized);
		});
		return filtered;
	}

	private async loadJobsFromBackend(): Promise<job[]> {
		const entities = await this.odata.readList('/ScanJob', {
			sorters: [new Sorter('StartedAt', true)]
		});
		return entities.map((entity) => mapJobEntity(entity));
	}

	private async loadJobFromBackend(jobId: string): Promise<job | null> {
		const entity = await this.odata.readOne(`/ScanJob(guid'${normalizeGuid(jobId)}')`);
		if (!entity) {
			return null;
		}

		return mapJobEntity(entity);
	}
}