import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { Job, Registry } from '../model/types';

interface RegistryStats {
	total: number;
	published: number;
	unpublished: number;
	archive: number;
}

const RECENT_LIMIT = 5;

/**
 * @namespace com.zgp9.fe.controller
 */
export default class Home extends BaseController {
	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				registryStats: { total: 0, published: 0, unpublished: 0, archive: 0 },
				recentRegistries: [] as Registry[],
				recentJobs: [] as Job[]
			}),
			'home'
		);

		this.getRouter()
			.getRoute('home')
			.attachPatternMatched(() => {
				void this.loadDashboard();
			});
	}

	public onNavigateRegistries(): void {
		this.navTo('registryList');
	}

	public onNavigateJobs(): void {
		this.navTo('jobList');
	}

	public onRegistryPress(event: UI5Event): void {
		const registry = this.getEntityFromEvent<Registry>(event);
		if (!registry) {
			return;
		}

		this.navTo('registryDetail', { registryId: registry.id });
	}

	public onJobPress(event: UI5Event): void {
		const job = this.getEntityFromEvent<Job>(event);
		if (!job) {
			return;
		}

		this.navTo('jobDetail', { jobId: job.id });
	}

	private async loadDashboard(): Promise<void> {
		const model = this.getModel('home') as JSONModel;
		model.setProperty('/busy', true);
		try {
			const [registries, jobs] = await Promise.all([
				this.getOwnerComponent().getRegistryService().getRegistries({
					search: '',
					searchField: 'all',
					status: 'All',
					groupType: 'All',
					registryName: '',
					createdBy: ''
				}),
				this.getOwnerComponent().getJobService().getJobs()
			]);

			model.setProperty('/registryStats', this.computeRegistryStats(registries));
			model.setProperty('/recentRegistries', this.sortByDateDesc(registries, (registry) => registry.lastChangedAt).slice(0, RECENT_LIMIT));
			model.setProperty('/recentJobs', jobs.slice(0, RECENT_LIMIT));
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}

	private computeRegistryStats(registries: Registry[]): RegistryStats {
		return registries.reduce<RegistryStats>(
			(stats, registry) => {
				stats.total += 1;
				if (registry.status === 'Published') {
					stats.published += 1;
				} else if (registry.status === 'Unpublished') {
					stats.unpublished += 1;
				} else if (registry.status === 'Archive') {
					stats.archive += 1;
				}
				return stats;
			},
			{ total: 0, published: 0, unpublished: 0, archive: 0 }
		);
	}

	private sortByDateDesc<T>(items: T[], getDate: (item: T) => string): T[] {
		return [...items].sort((left, right) => new Date(getDate(right)).getTime() - new Date(getDate(left)).getTime());
	}

	private getEntityFromEvent<T>(event: UI5Event): T | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => T } | null };
		const context = source.getBindingContext('home');
		return context?.getObject() ?? null;
	}
}
