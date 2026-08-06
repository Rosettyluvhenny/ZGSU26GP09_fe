import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';
import type UI5Event from 'sap/ui/base/Event';
import JSONModel from 'sap/ui/model/json/JSONModel';
import BusyIndicator from 'sap/ui/core/BusyIndicator';

import BaseController from './BaseController';


/**
 * @namespace com.zgp9.fe.controller
 */
export default class JobDetail extends BaseController {
	private jobId: string | null = null;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				job: null
			}),
			'jobDetail'
		);
		this.getRouter()
			.getRoute("jobDetail")
			.attachPatternMatched((event) => {
				void this.onRouteMatched(event);
			});
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as Route$PatternMatchedEvent).getParameter('arguments') as { jobId?: string };
		this.jobId = args.jobId ?? null;
		if (!this.jobId) {
			return;
		}

		await this.loadJob();
	}

	private async loadJob(): Promise<void> {
		if (!this.jobId) {
			return;
		}

		const model = this.getModel('jobDetail') as JSONModel;
		model.setProperty('/busy', true);
		BusyIndicator.show(0);
		try {
			const job = await this.getOwnerComponent().getJobService().getJob(this.jobId);
			model.setProperty('/job', job);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}
}
