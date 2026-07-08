import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';
import MessageToast from 'sap/m/MessageToast';
import Table from 'sap/m/Table';

import BaseController from './BaseController';
import type { Registry, RegistryVersion } from '../model/types';
import { mapRegistryEntity } from '../services/ODataParsers';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class RegistryDetail extends BaseController {
	private registryId: string | null = null;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				registry: null,
				versions: [],
				selectedVersionIds: [],
				selectionCountLabel: '0/2',
				canCompare: false,
				generateBusy: false
			}),
			'registryDetail'
		);
		this.getRouter().getRoute('registryDetail').attachPatternMatched(this.onRouteMatched, this);
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as any).getParameter('arguments') as { registryId?: string };
		this.registryId = args.registryId ?? null;
		if (!this.registryId) {
			return;
		}

		await this.loadRegistry();
	}

	public async onRefresh(): Promise<void> {
		await this.loadRegistry();
	}

	public async onGenerateVersion(): Promise<void> {
		if (!this.registryId) {
			return;
		}

		const model = this.getModel('registryDetail') as JSONModel;
		const registry = model.getProperty('/registry') as Registry;
		model.setProperty('/generateBusy', true);
		BusyIndicator.show(0);
		try {
			const response = await this.getOwnerComponent().getRegistryService().generateVersion(this.registryId, registry?.etag);
			MessageToast.show('Created successfully');

			if (response) {
				// Remove @odata.etag before merging so we don't update it
				delete response['@odata.etag'];
				const mappedResponse = mapRegistryEntity(response);

				// Update registry with all information except etag (which was removed)
				const updatedRegistry = { ...registry };
				(Object.keys(mappedResponse) as Array<keyof Registry>).forEach(key => {
					if (mappedResponse[key] !== undefined && mappedResponse[key] !== '') {
						// @ts-ignore
						updatedRegistry[key] = mappedResponse[key];
					}
				});
				model.setProperty('/registry', updatedRegistry);

				// We also need to reload just the versions list
				const versions = await this.getOwnerComponent().getVersionService().getVersions(this.registryId);
				model.setProperty('/versions', versions);
			} else {
				await this.loadRegistry();
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/generateBusy', false);
			BusyIndicator.hide();
		}
	}

	public onVersionSelectionChange(event: UI5Event): void {
		const table = event.getSource() as Table;
		const model = this.getModel('registryDetail') as JSONModel;
		const selectedItems = table.getSelectedItems();
		if (selectedItems.length > 2) {
			const changedItem = (event as any).getParameter('listItem') as any;
			if (changedItem) {
				table.setSelectedItem(changedItem, false);
			}
		}

		const selectedVersionIds = table.getSelectedItems().slice(0, 2).map((item) => {
			const context = item.getBindingContext('registryDetail');
			return (context?.getObject() as RegistryVersion | null)?.id ?? '';
		}).filter(Boolean);

		model.setProperty('/selectedVersionIds', selectedVersionIds);
		model.setProperty('/selectionCountLabel', `${selectedVersionIds.length}/2`);
		model.setProperty('/canCompare', selectedVersionIds.length === 2);
	}

	public onComparePress(): void {
		if (!this.registryId) {
			return;
		}

		const model = this.getModel('registryDetail') as JSONModel;
		const selectedVersionIds = (model.getProperty('/selectedVersionIds') as string[]) ?? [];
		if (selectedVersionIds.length !== 2) {
			return;
		}

		this.navTo('versionCompare', {
			registryId: this.registryId,
			leftVersionId: selectedVersionIds[0],
			rightVersionId: selectedVersionIds[1]
		});
	}

	public onVersionPress(event: UI5Event): void {
		const version = this.getVersionFromEvent(event);
		if (!version || !this.registryId) {
			return;
		}

		this.navTo('versionDetail', { registryId: this.registryId, versionId: version.id });
	}

	private async loadRegistry(): Promise<void> {
		if (!this.registryId) {
			return;
		}

		const model = this.getModel('registryDetail') as JSONModel;
		model.setProperty('/busy', true);
		BusyIndicator.show(0);
		try {
			const [registry, versions] = await Promise.all([
				this.getOwnerComponent().getRegistryService().getRegistry(this.registryId),
				this.getOwnerComponent().getVersionService().getVersions(this.registryId)
			]);
			model.setData({
				busy: false,
				registry,
				versions,
				selectedVersionIds: [],
				selectionCountLabel: '0/2',
				canCompare: false,
				generateBusy: false
			});
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	private getVersionFromEvent(event: UI5Event): RegistryVersion | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => RegistryVersion } | null };
		const context = source.getBindingContext('registryDetail');
		return context?.getObject() ?? null;
	}
}
