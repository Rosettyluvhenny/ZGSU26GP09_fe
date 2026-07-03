import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import type ListItemBase from 'sap/m/ListItemBase';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { Registry, RegistryDetail, RegistryVersion } from '../model/types';

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
}
