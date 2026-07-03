import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { Registry } from '../model/types';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class RegistryList extends BaseController {
	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [],
				busy: false,
				search: '',
				status: 'All'
			}),
			'registryList'
		);

		this.getRouter().getRoute('registryList').attachPatternMatched(this.onRouteMatched, this);
		void this.loadRegistries();
	}

	public async onRouteMatched(): Promise<void> {
		await this.loadRegistries();
	}

	public async loadRegistries(): Promise<void> {
		const model = this.getModel('registryList') as JSONModel;
		model.setProperty('/busy', true);
		try {
			const data = await this.getOwnerComponent().getRegistryService().getRegistries(
				model.getProperty('/search') as string,
				model.getProperty('/status') as string
			);
			model.setProperty('/items', data);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}

	public async onRefresh(): Promise<void> {
		await this.loadRegistries();
	}

	public async onSearchLiveChange(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getValue: () => string };
		(this.getModel('registryList') as JSONModel).setProperty('/search', source.getValue());
		await this.loadRegistries();
	}

	public async onStatusChange(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getSelectedKey: () => string };
		(this.getModel('registryList') as JSONModel).setProperty('/status', source.getSelectedKey());
		await this.loadRegistries();
	}

	public onRowPress(event: UI5Event): void {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		this.navTo('registryDetail', { registryId: registry.id });
	}

	private getRegistryFromEvent(event: UI5Event): Registry | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => Registry } | null };
		const context = source.getBindingContext('registryList');
		return context?.getObject() ?? null;
	}
}
