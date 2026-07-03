import JSONModel from 'sap/ui/model/json/JSONModel';
import SelectDialog from 'sap/m/SelectDialog';
import StandardListItem from 'sap/m/StandardListItem';
import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import MessageToast from 'sap/m/MessageToast';

import BaseController from './BaseController';
import type { Registry } from '../model/types';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class JobList extends BaseController {
	private registrySelectDialog?: SelectDialog;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [],
				busy: false,
				search: ''
			}),
			'jobList'
		);
		this.getRouter().getRoute('jobList').attachPatternMatched(this.onRouteMatched, this);
	}

	public async onRouteMatched(): Promise<void> {
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
				search: model.getProperty('/search')
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
		await this.openRegistrySelectDialog();
	}

	private async openRegistrySelectDialog(): Promise<void> {
		if (!this.registrySelectDialog) {
			this.registrySelectDialog = new SelectDialog({
				title: 'Select Registry',
				multiSelect: false,
				search: async (event) => {
					const value = (event.getParameter('value') as string) ?? '';
					await this.loadRegistrySelection(value);
				},
				confirm: async (event) => {
					const selectedItem = event.getParameter('selectedItem') as StandardListItem | null;
					if (!selectedItem) {
						return;
					}

					const context = selectedItem.getBindingContext('registrySelect');
					const registry = context?.getObject() as Registry | undefined;
					if (!registry) {
						return;
					}

					BusyIndicator.show(0);
					try {
						await this.getOwnerComponent().getJobService().runScanJob(registry.id, registry.registryName);
						MessageToast.show('Scan job started.');
						await this.loadJobs();
					} catch (error) {
						await this.handleServiceError(error);
					} finally {
						BusyIndicator.hide();
					}
				}
			});
			this.getView().addDependent(this.registrySelectDialog);
			await this.loadRegistrySelection('');
		}

		this.registrySelectDialog.open('');
	}

	private async loadRegistrySelection(search: string): Promise<void> {
		const registries = await this.getOwnerComponent().getRegistryService().getRegistries(search, 'All');
		const model = new JSONModel({ items: registries });
		this.registrySelectDialog?.setModel(model, 'registrySelect');
		this.registrySelectDialog?.bindAggregation('items', {
			path: 'registrySelect>/items',
			template: new StandardListItem({
				title: '{registrySelect>registryName}',
				description: '{registrySelect>serviceName}'
			})
		});
	}
}


