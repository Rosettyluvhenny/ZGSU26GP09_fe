import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import MessageToast from 'sap/m/MessageToast';

import BaseController from './BaseController';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class JobList extends BaseController {

	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [],
				busy: false,
				search: ''
			}),
			'jobList'
		);
		this.getRouter()
			.getRoute("jobList")
			.attachPatternMatched(() => {
				void this.onRouteMatched();
			});
	}

	public async onRouteMatched(): Promise<void> {
		// Permission already loaded at startup by MainShell; just guard here
		if (!this.getUiModel().getProperty("/canExecuteScanJob")) {
			MessageToast.show("Access denied.");
			this.getRouter().navTo("home", {}, true);
			return;
		}

		await this.loadJobs();
	}

	public async loadJobs(): Promise<void> {
		const model = this.getModel('jobList') as JSONModel;
		model.setProperty('/busy', true);
		try {
			const jobs = await this.getOwnerComponent().getJobService().getJobs(model.getProperty('/search') as string);
			model.setProperty('/items', jobs);
			console.log('Job scan list fetched successfully', {
				count: jobs.length,
				search: model.getProperty('/search') as string
			});
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}

	public async onRefresh(): Promise<void> {
		await this.loadJobs();
	}

	public async onSearchLiveChange(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getValue: () => string };
		const model = this.getModel('jobList') as JSONModel;
		model.setProperty('/search', source.getValue());
		await this.loadJobs();
	}

	public onRowPress(event: UI5Event): void {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => { id: string } } | null };
		const context = source.getBindingContext('jobList');
		const job = context?.getObject();
		if (!job) {
			return;
		}

		this.navTo('jobDetail', { jobId: job.id });
	}

	public async onRunScanJob(): Promise<void> {
		BusyIndicator.show(0);
		try {
			await this.getOwnerComponent().getJobService().runScanJob();
			MessageToast.show('Scan job started.');
			await this.loadJobs();
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			BusyIndicator.hide();
		}
	}
}


