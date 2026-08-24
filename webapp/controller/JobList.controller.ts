import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import MessageToast from 'sap/m/MessageToast';
import Fragment from 'sap/ui/core/Fragment';
import type Dialog from 'sap/m/Dialog';

import BaseController from './BaseController';
import type { Job } from '../model/types';
import { JOB_PAGE_SIZE } from '../services/JobService';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class JobList extends BaseController {
	private _jobDetailDialog: Dialog | null = null;
	private loadingMore = false;

	public onInit(): void {
		const model = new JSONModel({
			items: [],
			busy: false,
			loadingMore: false,
			search: '',
			triggerType: 'All',
			status: 'All',
			triggerTypeOptions: [
				{ key: 'All', text: 'All Trigger Types' },
				{ key: 'A', text: 'Auto' },
				{ key: 'M', text: 'Manual' }
			],
			statusOptions: [
				{ key: 'All', text: 'All Statuses' },
				{ key: 'C', text: 'Completed' },
				{ key: 'R', text: 'Running' },
				{ key: 'F', text: 'Failed' }
			],
			totalCount: 0,
			hasMore: false,
			countLabel: '0 jobs',
			selectedJob: null as Job | null
		});
		model.setSizeLimit(5000);
		this.setModel(model, 'jobList');
		this.getRouter()
			.getRoute("jobList")
			.attachPatternMatched(() => {
				void this.onRouteMatched();
			});
	}

	public async onRouteMatched(): Promise<void> {
		if (!this.getUiModel().getProperty("/canExecuteScanJob")) {
			MessageToast.show("Access denied.");
			this.getRouter().navTo("home", {}, undefined, true);
			return;
		}

		(this.getModel('jobList') as JSONModel).setProperty('/selectedJob', null);
		await this.loadJobs(true);
	}

	public async loadJobs(reset: boolean): Promise<void> {
		const model = this.getModel('jobList') as JSONModel;
		const currentItems = (model.getProperty('/items') as Job[]) ?? [];
		const skip = reset ? 0 : currentItems.length;

		if (!reset) {
			if (!model.getProperty('/hasMore') || this.loadingMore) {
				return;
			}
			this.loadingMore = true;
			model.setProperty('/loadingMore', true);
		} else {
			model.setProperty('/busy', true);
		}

		try {
			const page = await this.getOwnerComponent().getJobService().getJobs({
				search: model.getProperty('/search') as string,
				triggerType: model.getProperty('/triggerType') as string,
				status: model.getProperty('/status') as string,
				top: JOB_PAGE_SIZE,
				skip
			});
			const items = reset ? page.items : currentItems.concat(page.items);
			const totalCount = page.totalCount;
			const hasMore = items.length < totalCount && page.items.length > 0;

			model.setProperty('/items', items);
			model.setProperty('/totalCount', totalCount);
			model.setProperty('/hasMore', hasMore);
			model.setProperty('/countLabel', this.buildCountLabel(items.length, totalCount));
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			model.setProperty('/loadingMore', false);
			this.loadingMore = false;
		}
	}

	public async onLoadMore(): Promise<void> {
		if (this.loadingMore) {
			return;
		}
		await this.loadJobs(false);
	}

	public async onRefresh(): Promise<void> {
		await this.loadJobs(true);
	}

	public async onFilterChange(): Promise<void> {
		await this.loadJobs(true);
	}

	public async onSearch(event: UI5Event): Promise<void> {
		const model = this.getModel('jobList') as JSONModel;
		// The search event reliably provides the entered text via the 'query' parameter on the event object
		const query = event.getParameter('query') as string | undefined;
		model.setProperty('/search', query || '');
		await this.loadJobs(true);
	}

	public onRowPress(event: UI5Event): void {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => Job } | null };
		const job = source.getBindingContext('jobList')?.getObject();
		if (!job) {
			return;
		}

		(this.getModel('jobList') as JSONModel).setProperty('/selectedJob', job);
		void this.openJobDetailDialog();
	}

	public onViewJobLogs(): void {
		const job = (this.getModel('jobList') as JSONModel).getProperty('/selectedJob') as Job | null;
		if (!job) {
			return;
		}

		this._jobDetailDialog?.close();
		this.getRouter().navTo('logs', { '?query': { jobId: job.id } });
	}

	public onCloseJobDialog(): void {
		this._jobDetailDialog?.close();
	}

	public async onRunScanJob(): Promise<void> {
		BusyIndicator.show(0);
		try {
			await this.getOwnerComponent().getJobService().runScanJob();
			MessageToast.show('Scan job started.');
			await this.loadJobs(true);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			BusyIndicator.hide();
		}
	}

	private buildCountLabel(shown: number, total: number): string {
		if (total <= 0) {
			return '0 jobs';
		}
		return `${shown}/${total} jobs`;
	}

	private async openJobDetailDialog(): Promise<void> {
		if (!this._jobDetailDialog) {
			this._jobDetailDialog = (await Fragment.load({
				id: this.getView().getId(),
				name: 'com.zgp9.fe.view.fragments.JobDetailDialog',
				controller: this
			})) as Dialog;
			this.getView().addDependent(this._jobDetailDialog);
		}

		this._jobDetailDialog.open();
	}
}
