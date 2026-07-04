import BusyIndicator from 'sap/ui/core/BusyIndicator';
import Dialog from 'sap/m/Dialog';
import Fragment from 'sap/ui/core/Fragment';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';
import type ListItemBase from 'sap/m/ListItemBase';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import ServiceError from '../services/ServiceError';
import type { Registry, RegistryCreateInput, RegistryValueHelpItem } from '../model/types';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class RegistryList extends BaseController {
	private registryDialogPromise?: Promise<Dialog>;
	private dialogMode: 'create' | 'edit' = 'create';
	private currentRegistryId: string | null = null;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [],
				busy: false,
				search: '',
				status: 'All',
				canCreate: false,
				canUpdate: false
			}),
			'registryList'
		);

		this.getRouter().getRoute('registryList').attachPatternMatched(this.onRouteMatched, this);
		void this.refreshRegistryPage();
	}

	public async onRouteMatched(): Promise<void> {
		await this.refreshRegistryPage();
	}

	public async onRefresh(): Promise<void> {
		await this.refreshRegistryPage();
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

	public onGroupTypeChange(event: UI5Event): void {
		const source = event.getSource() as unknown as { getSelectedKey: () => string };
		const groupType = source.getSelectedKey();
		const dialogModel = this.getModel('registryDialog') as JSONModel | undefined;
		if (!dialogModel) {
			return;
		}

		dialogModel.setProperty('/showVersionNo', groupType !== '002');
		if (groupType === '002') {
			dialogModel.setProperty('/versionNo', '');
		} else if (!dialogModel.getProperty('/versionNo')) {
			dialogModel.setProperty('/versionNo', '001');
		}
	}

	public onRowPress(event: UI5Event): void {
		const registry = this.getRegistryFromEvent(event);
		if (!registry) {
			return;
		}

		this.navTo('registryDetail', { registryId: registry.id });
	}

	public async onCreateRegistry(): Promise<void> {
		this.dialogMode = 'create';
		this.currentRegistryId = null;
		await this.openRegistryDialog({
			groupName: '',
			groupType: '001',
			versionNo: ''
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
			groupName: registry.registryName,
			groupType: this.getGroupTypeIdFromRegistry(registry),
			versionNo: this.getVersionNoFromRegistry(registry),
			status: this.getStatusKeyFromRegistry(registry)
		});
	}

	public async onSaveRegistryDialog(): Promise<void> {
		const model = this.getView().getModel('registryDialog') as JSONModel;
		const data = model.getData() as {
			groupName?: string;
			groupType?: string;
			versionNo?: string;
			status?: string;
		};

		BusyIndicator.show(0);
		model.setProperty('/busy', true);
		try {
			if (this.dialogMode === 'create') {
				await this.getOwnerComponent().getRegistryService().createRegistry({
					groupName: data.groupName ?? '',
					groupType: data.groupType ?? '',
					versionNo: data.groupType === '002' ? '' : data.versionNo ?? ''
				} satisfies RegistryCreateInput);
				MessageToast.show('Registry created.');
			} else if (this.currentRegistryId) {
				await this.getOwnerComponent().getRegistryService().updateRegistry(this.currentRegistryId, {
					status: data.status ?? ''
				});
				MessageToast.show('Registry updated.');
			}

			await this.loadRegistries();
			await this.closeRegistryDialog();
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	public async onCancelRegistryDialog(): Promise<void> {
		await this.closeRegistryDialog();
	}

	private async refreshRegistryPage(): Promise<void> {
		await this.loadPermissions();
		await this.loadRegistries();
	}

	private async loadPermissions(): Promise<void> {
		const model = this.getModel('registryList') as JSONModel;
		try {
			const permissions = await this.getOwnerComponent().getRegistryService().getPermissions();
			model.setProperty('/canCreate', permissions.includes('Registry.Create'));
			model.setProperty('/canUpdate', permissions.includes('Registry.Update'));
		} catch (error) {
			if (error instanceof ServiceError && (error.status === 401 || error.status === 403)) {
				await this.handleServiceError(error);
				return;
			}

			model.setProperty('/canCreate', false);
			model.setProperty('/canUpdate', false);
		}
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

	private async openRegistryDialog(initialData: {
		groupName: string;
		groupType: string;
		versionNo: string;
		status?: string;
	}): Promise<void> {
		const dialogModel = new JSONModel({
			mode: this.dialogMode,
			title: this.dialogMode === 'create' ? 'Create Registry' : 'Update Registry',
			busy: false,
			groupName: initialData.groupName,
			groupType: initialData.groupType,
			versionNo: initialData.versionNo,
			status: initialData.status ?? '',
			showVersionNo: initialData.groupType !== '002',
			groupTypes: [] as RegistryValueHelpItem[],
			statuses: [] as RegistryValueHelpItem[]
		});
		dialogModel.setDefaultBindingMode('TwoWay');
		this.setModel(dialogModel, 'registryDialog');

		await this.loadRegistryDialogValueHelp(dialogModel);

		if (this.dialogMode === 'create' && !dialogModel.getProperty('/groupType')) {
			const groupTypes = dialogModel.getProperty('/groupTypes') as RegistryValueHelpItem[];
			dialogModel.setProperty('/groupType', groupTypes[0]?.key ?? '001');
		}

		if (this.dialogMode === 'edit' && !dialogModel.getProperty('/status')) {
			const statuses = dialogModel.getProperty('/statuses') as RegistryValueHelpItem[];
			dialogModel.setProperty('/status', statuses[0]?.key ?? 'P');
		}

		dialogModel.setProperty('/showVersionNo', dialogModel.getProperty('/groupType') !== '002');

		if (this.dialogMode === 'create' && dialogModel.getProperty('/groupType') === '002') {
			dialogModel.setProperty('/versionNo', '');
		}

		if (this.dialogMode === 'create' && !dialogModel.getProperty('/versionNo') && dialogModel.getProperty('/groupType') === '001') {
			dialogModel.setProperty('/versionNo', '001');
		}

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
		dialog.setModel(dialogModel, 'registryDialog');
		dialog.open();
	}

	private async loadRegistryDialogValueHelp(model: JSONModel): Promise<void> {
		model.setProperty('/busy', true);
		try {
			const [groupTypes, statuses] = await Promise.all([
				this.getOwnerComponent().getRegistryService().getGroupTypes(),
				this.getOwnerComponent().getRegistryService().getStatuses()
			]);
			model.setProperty('/groupTypes', groupTypes);
			model.setProperty('/statuses', statuses);
		} finally {
			model.setProperty('/busy', false);
		}
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

	private getStatusKeyFromRegistry(registry: Registry): string {
		const currentStatus = `${registry.statusText ?? registry.status}`.trim().toLowerCase();
		switch (currentStatus) {
			case 'publish':
				return 'P';
			case 'unpublish':
				return 'U';
			case 'archive':
				return 'A';
			default: {
				const options = this.getModel('registryDialog')?.getProperty('/statuses') as RegistryValueHelpItem[] | undefined;
				const matched = options?.find((item) => item.text.toLowerCase() === currentStatus);
				return matched?.key ?? '';
			}
		}
	}

	private getGroupTypeIdFromRegistry(registry: Registry): string {
		const options = this.getModel('registryDialog')?.getProperty('/groupTypes') as RegistryValueHelpItem[] | undefined;
		const matched = options?.find((item) => item.text.toLowerCase() === registry.serviceType.toLowerCase());
		return matched?.key ?? '';
	}

	private getVersionNoFromRegistry(registry: Registry): string {
		const latestVersion = registry.versions[registry.versions.length - 1];
		return latestVersion?.versionNumber ?? '';
	}
}
