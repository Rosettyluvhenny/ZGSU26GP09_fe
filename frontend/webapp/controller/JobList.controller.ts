import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import MessageToast from 'sap/m/MessageToast';
import Fragment from 'sap/ui/core/Fragment';
import type Dialog from 'sap/m/Dialog';

import BaseController from './BaseController';
import type { job } from '../model/types';

/**
 * @namespace com.zgp09.fe.controller
 */
export default class JobList extends BaseController {
	private _jobDetailDialog: Dialog | null = null;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [],
				busy: false,
				search: '',
				selectedJob: null as job | null
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
		if (!this.getUiModel().getProperty("/canExecuteScanJob")) {
			MessageToast.show("Access denied.");
			this.getRouter().navTo("home", {}, undefined, true);
			return;
		}

		(this.getModel('jobList') as JSONModel).setProperty('/selectedJob', null);
		await this.loadJobs();
	}

	public async loadJobs(): Promise<void> {
		const model = this.getModel('jobList') as JSONModel;
		model.setProperty('/busy', true);
		try {
			const jobs = await this.getOwnerComponent().getJobService().getJobs(model.getProperty('/search') as string);
			model.setProperty('/items', jobs);
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
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => job } | null };
		const job = source.getBindingContext('jobList')?.getObject();
		if (!job) {
			return;
		}

		(this.getModel('jobList') as JSONModel).setProperty('/selectedJob', job);
		void this.openJobDetailDialog();
	}

	public onViewJobLogs(): void {
		const job = (this.getModel('jobList') as JSONModel).getProperty('/selectedJob') as job | null;
		if (!job) {
			return;
		}

		this._jobDetailDialog?.close();
		this.getRouter().navTo('logs', { '?query': { jobId: job.scanJobId } });
	}

	public onCloseJobDialog(): void {
		this._jobDetailDialog?.close();
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

	private async openJobDetailDialog(): Promise<void> {
		if (!this._jobDetailDialog) {
			this._jobDetailDialog = (await Fragment.load({
				id: this.getView().getId(),
				name: 'com.zgp09.fe.view.fragments.JobDetailDialog',
				controller: this
			})) as Dialog;
			this.getView().addDependent(this._jobDetailDialog);
		}

		this._jobDetailDialog.open();
	}
}
