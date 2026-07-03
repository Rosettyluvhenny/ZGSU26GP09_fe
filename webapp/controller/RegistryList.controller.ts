import BusyIndicator from 'sap/ui/core/BusyIndicator';
import Dialog from 'sap/m/Dialog';
import Fragment from 'sap/ui/core/Fragment';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageBox from 'sap/m/MessageBox';
import MessageToast from 'sap/m/MessageToast';
import type ListItemBase from 'sap/m/ListItemBase';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { Registry, RegistryDetail, RegistryInput, RegistryVersion } from '../model/types';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class RegistryList extends BaseController {
	private registryDialogPromise?: Promise<Dialog>;
	private currentRegistryId: string | null = null;
	private dialogMode: 'create' | 'edit' = 'create';

	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [],
				busy: false,
				search: '',
				status: 'All',
				selectedRegistryId: '',
				selectedRegistry: null,
				versions: [],
				versionsBusy: false,
				selectedVersionId: '',
				selectedVersion: null,
				details: [],
				detailsBusy: false,
				selectedDetailId: '',
				selectedDetail: null,
				selectedDetailXml: '',
				selectedDetailBusy: false
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
		this.clearSelection();
	}

	public async onStatusChange(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getSelectedKey: () => string };
		(this.getModel('registryList') as JSONModel).setProperty('/status', source.getSelectedKey());
		await this.loadRegistries();
		this.clearSelection();
	}

	public async onCreateRegistry(): Promise<void> {
		this.dialogMode = 'create';
		this.currentRegistryId = null;
		await this.openRegistryDialog({
			registryName: '',
			serviceDefinition: '',
			serviceType: 'RAP',
			description: ''
		});
	}

	public async onEditRegistry(event: UI5Event): Promise<void> {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		this.dialogMode = 'edit';
		this.currentRegistryId = registry.id;
		await this.openRegistryDialog({
			registryName: registry.registryName,
			serviceDefinition: registry.serviceDefinition,
			serviceType: registry.serviceType,
			description: registry.description
		});
	}

	public async onDeleteRegistry(event: UI5Event): Promise<void> {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		const confirmed = await this.confirm(`Delete registry ${registry.registryName}?`);
		if (!confirmed) {
			return;
		}

		BusyIndicator.show(0);
		try {
			await this.getOwnerComponent().getRegistryService().deleteRegistry(registry.id);
			MessageToast.show('Registry deleted.');
			await this.loadRegistries();
			this.clearSelection();
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			BusyIndicator.hide();
		}
	}

	public async onActivateRegistry(event: UI5Event): Promise<void> {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		const confirmed = await this.confirm(`Publish ${registry.registryName}?`);
		if (!confirmed) {
			return;
		}

		BusyIndicator.show(0);
		try {
			await this.getOwnerComponent().getRegistryService().activateRegistry(registry.id);
			MessageToast.show('Registry published.');
			await this.loadRegistries();
			await this.selectRegistryById(registry.id);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			BusyIndicator.hide();
		}
	}

	public async onDeactivateRegistry(event: UI5Event): Promise<void> {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		const confirmed = await this.confirm(`Unpublish ${registry.registryName}?`);
		if (!confirmed) {
			return;
		}

		BusyIndicator.show(0);
		try {
			await this.getOwnerComponent().getRegistryService().deactivateRegistry(registry.id);
			MessageToast.show('Registry unpublished.');
			await this.loadRegistries();
			await this.selectRegistryById(registry.id);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			BusyIndicator.hide();
		}
	}

	public async onGenerateVersion(event: UI5Event): Promise<void> {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		BusyIndicator.show(0);
		try {
			await this.getOwnerComponent().getRegistryService().generateVersion(registry.id, 'Generated from frontend');
			MessageToast.show('Version generated.');
			await this.loadRegistries();
			await this.selectRegistryById(registry.id);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			BusyIndicator.hide();
		}
	}

	public async onViewVersions(event: UI5Event): Promise<void> {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		await this.selectRegistryById(registry.id);
	}

	public async onRowPress(event: UI5Event): Promise<void> {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		await this.selectRegistryById(registry.id);
	}

	public async onVersionPress(event: UI5Event): Promise<void> {
		const version = this.getVersionFromEvent(event);
		if (!version) {
			return;
		}

		await this.selectVersionById(version.id);
	}

	public async onDetailPress(event: UI5Event): Promise<void> {
		const detail = this.getDetailFromEvent(event);
		if (!detail) {
			return;
		}

		await this.selectDetailById(detail.id);
	}

	public async onSaveRegistryDialog(): Promise<void> {
		const model = this.getView().getModel('registryDialog') as JSONModel;
		const input = model.getData() as RegistryInput;
		const service = this.getOwnerComponent().getRegistryService();
		BusyIndicator.show(0);
		try {
			if (this.dialogMode === 'edit' && this.currentRegistryId) {
				await service.updateRegistry(this.currentRegistryId, input);
				MessageToast.show('Registry updated.');
			} else {
				await service.createRegistry(input);
				MessageToast.show('Registry created.');
			}

			await this.loadRegistries();
			await this.closeRegistryDialog();
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			BusyIndicator.hide();
		}
	}

	public async onCancelRegistryDialog(): Promise<void> {
		await this.closeRegistryDialog();
	}

	private async selectRegistryById(registryId: string, versionId = '', detailId = ''): Promise<void> {
		const model = this.getModel('registryList') as JSONModel;
		const registry = (model.getProperty('/items') as Registry[]).find((item) => item.id === registryId);
		if (!registry) {
			return;
		}

		model.setProperty('/selectedRegistryId', registry.id);
		model.setProperty('/selectedRegistry', registry);
		model.setProperty('/selectedVersionId', '');
		model.setProperty('/selectedVersion', null);
		model.setProperty('/selectedDetailId', '');
		model.setProperty('/selectedDetail', null);
		model.setProperty('/selectedDetailXml', '');
		model.setProperty('/versions', []);
		model.setProperty('/details', []);
		model.setProperty('/versionsBusy', true);
		model.setProperty('/detailsBusy', false);
		model.setProperty('/selectedDetailBusy', false);

		try {
			const versions = await this.getOwnerComponent().getVersionService().getVersions(registry.id);
			model.setProperty('/versions', versions);
			if (versionId) {
				await this.selectVersionById(versionId, detailId);
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/versionsBusy', false);
		}
	}

	private async selectVersionById(versionId: string, detailId = ''): Promise<void> {
		const model = this.getModel('registryList') as JSONModel;
		const versions = model.getProperty('/versions') as RegistryVersion[];
		const version = versions.find((item) => item.id === versionId);
		if (!version) {
			return;
		}

		model.setProperty('/selectedVersionId', version.id);
		model.setProperty('/selectedVersion', version);
		model.setProperty('/selectedDetailId', '');
		model.setProperty('/selectedDetail', null);
		model.setProperty('/selectedDetailXml', '');
		model.setProperty('/details', []);
		model.setProperty('/detailsBusy', true);
		model.setProperty('/selectedDetailBusy', false);

		try {
			const details = await this.getOwnerComponent().getDetailService().getDetails(version.id);
			model.setProperty('/details', details);
			if (detailId) {
				await this.selectDetailById(detailId);
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/detailsBusy', false);
		}
	}

	private async selectDetailById(detailId: string): Promise<void> {
		const model = this.getModel('registryList') as JSONModel;
		const details = model.getProperty('/details') as RegistryDetail[];
		const detail = details.find((item) => item.id === detailId);
		if (!detail) {
			return;
		}

		model.setProperty('/selectedDetailId', detail.id);
		model.setProperty('/selectedDetail', detail);
		model.setProperty('/selectedDetailBusy', true);
		model.setProperty('/selectedDetailXml', '');

		BusyIndicator.show(0);
		try {
			const parsedDetail = await this.getOwnerComponent().getDetailService().getParsedDetail(detail.id);
			model.setProperty('/selectedDetailXml', parsedDetail.metadataXml);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/selectedDetailBusy', false);
			BusyIndicator.hide();
		}
	}

	private clearSelection(): void {
		const model = this.getModel('registryList') as JSONModel;
		model.setProperty('/selectedRegistryId', '');
		model.setProperty('/selectedRegistry', null);
		model.setProperty('/selectedVersionId', '');
		model.setProperty('/selectedVersion', null);
		model.setProperty('/selectedDetailId', '');
		model.setProperty('/selectedDetail', null);
		model.setProperty('/versions', []);
		model.setProperty('/details', []);
		model.setProperty('/selectedDetailXml', '');
	}

	private async openRegistryDialog(initialData: RegistryInput): Promise<void> {
		const model = new JSONModel(initialData);
		model.setDefaultBindingMode('TwoWay');
		this.setModel(model, 'registryDialog');

		if (!this.registryDialogPromise) {
			this.registryDialogPromise = Fragment.load({
				id: this.getView().getId(),
				name: 'com.zgp9.fe.view.fragments.RegistryDialog',
				controller: this
			}).then((dialog) => {
				this.getView().addDependent(dialog as Dialog);
				return dialog as Dialog;
			});
		}

		const dialog = await this.registryDialogPromise;
		dialog.setModel(model, 'registryDialog');
		dialog.open();
	}

	private async closeRegistryDialog(): Promise<void> {
		if (!this.registryDialogPromise) {
			return;
		}

		const dialog = await this.registryDialogPromise;
		dialog.close();
	}

	private getRegistryFromEvent(event: UI5Event): Registry | null {
		const source = event.getSource() as unknown as ListItemBase;
		const context = source.getBindingContext('registryList');
		return (context?.getObject() as Registry) ?? null;
	}

	private getVersionFromEvent(event: UI5Event): RegistryVersion | null {
		const source = event.getSource() as unknown as ListItemBase;
		const context = source.getBindingContext('registryList');
		return (context?.getObject() as RegistryVersion) ?? null;
	}

	private getDetailFromEvent(event: UI5Event): RegistryDetail | null {
		const source = event.getSource() as unknown as ListItemBase;
		const context = source.getBindingContext('registryList');
		return (context?.getObject() as RegistryDetail) ?? null;
	}

	private confirm(message: string): Promise<boolean> {
		return new Promise((resolve) => {
			MessageBox.confirm(message, {
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				emphasizedAction: MessageBox.Action.OK,
				onClose: (action) => resolve(action === MessageBox.Action.OK)
			});
		});
	}
}
