import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';
import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';
import History from 'sap/ui/core/routing/History';
import Table from 'sap/m/Table';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';
import MessageToast from 'sap/m/MessageToast';

import BaseController from './BaseController';
import type { registry, registryVersion } from '../model/types';
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
		this.getRouter()
			.getRoute("registryDetail")
			.attachPatternMatched((event) => {
				void this.onRouteMatched(event);
			});
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as Route$PatternMatchedEvent).getParameter('arguments') as { registryId?: string };
		this.registryId = args.registryId ?? null;
		if (!this.registryId) {
			return;
		}

		await this.loadRegistry();
	}

	public onNavBack(): void {
		// Prefer browser history so Logs → Registry Detail → Back returns to Logs
		// (not always Registry List). Deep links still fall back to the list.
		const previousHash = History.getInstance().getPreviousHash();
		if (previousHash !== undefined && previousHash !== '') {
			window.history.go(-1);
			return;
		}
		this.navTo('registryList', {}, true);
	}

	public async onRefresh(): Promise<void> {
		await this.loadRegistry();
	}

	public async onGenerateVersion(): Promise<void> {
		if (!this.registryId) {
			return;
		}

		const model = this.getModel('registryDetail') as JSONModel;
		const registry = model.getProperty('/registry') as registry;
		model.setProperty('/generateBusy', true);
		BusyIndicator.show(0);
		try {
			const response = await this.getOwnerComponent().getRegistryService().generateVersion(this.registryId, registry?.etag);
			MessageToast.show('Created successfully');

			if (response) {
				const responseRecord = response as Record<string, unknown>;
				// Remove @odata.etag before merging so we don't update it
				delete responseRecord['@odata.etag'];
				const mappedResponse = mapRegistryEntity(responseRecord);
				// Update registry with all information except etag (which was removed)
				const updatedRegistry = { ...registry };
				(Object.keys(mappedResponse) as Array<keyof registry>).forEach(key => {
					if (mappedResponse[key] !== undefined && mappedResponse[key] !== '') {
					// @ts-expect-error – dynamic key assignment across typed Registry fields
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
		const table = event.getSource() as unknown as Table;
		const model = this.getModel('registryDetail') as JSONModel;
		const selectedItems = table.getSelectedItems();
		if (selectedItems.length > 2) {
			const changedItem = (event as ListBase$ItemPressEvent).getParameter('listItem');
			if (changedItem) {
				table.setSelectedItem(changedItem, false);
			}
		}

		const selectedVersionIds = table.getSelectedItems().slice(0, 2).map((item) => {
			const context = item.getBindingContext('registryDetail');
			return (context?.getObject() as registryVersion | null)?.versionId ?? '';
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

		// Sort versions by createdAt ascending so that the OLDER version is always
		// on the LEFT (Base) and the NEWER version is on the RIGHT (Compare).
		// This follows the standard diff convention: left = before, right = after.
		const allVersions = (model.getProperty('/versions') as registryVersion[]) ?? [];
		const selected = selectedVersionIds
			.map(id => allVersions.find(v => v.versionId === id))
			.filter((v): v is registryVersion => !!v);
		selected.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

		this.navTo('versionCompare', {
			registryId: this.registryId,
			leftVersionId: selected[0]?.versionId ?? selectedVersionIds[0],   // older → Base (left)
			rightVersionId: selected[1]?.versionId ?? selectedVersionIds[1]   // newer → Compare (right)
		});
	}

	public onVersionPress(event: UI5Event): void {
		const version = this.getVersionFromEvent(event);
		if (!version || !this.registryId) {
			return;
		}

		this.navTo('versionDetail', { registryId: this.registryId, versionId: version.versionId });
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
			// Clear table's internal selection state so checkboxes don't linger after back-navigation
			(this.byId('versionsTable') as Table)?.removeSelections(true);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	private getVersionFromEvent(event: UI5Event): registryVersion | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => registryVersion } | null };
		const context = source.getBindingContext('registryDetail');
		return context?.getObject() ?? null;
	}
}
