import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { RegistryDetail, RegistryVersion } from '../model/types';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class VersionDetail extends BaseController {
	private registryId: string | null = null;
	private versionId: string | null = null;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				version: null,
				details: [],
				selectedDetail: null,
				selectedDetailXml: '',
				selectedDetailBusy: false
			}),
			'versionDetail'
		);
		this.getRouter().getRoute('versionDetail').attachPatternMatched(this.onRouteMatched, this);
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as any).getParameter('arguments') as { registryId?: string; versionId?: string };
		this.registryId = args.registryId ?? null;
		this.versionId = args.versionId ?? null;
		if (!this.registryId || !this.versionId) {
			return;
		}

		await this.loadVersion();
	}

	public async onRefresh(): Promise<void> {
		await this.loadVersion();
	}

	public async onDetailSelect(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getSelectedItem: () => { getBindingContext: (name?: string) => { getObject: () => RegistryDetail } | null } | null };
		const selectedItem = source.getSelectedItem();
		const context = selectedItem?.getBindingContext('versionDetail');
		const detail = context?.getObject();
		if (!detail) {
			return;
		}

		await this.loadDetailXml(detail);
	}

	private async loadVersion(): Promise<void> {
		if (!this.registryId || !this.versionId) {
			return;
		}

		const model = this.getModel('versionDetail') as JSONModel;
		model.setProperty('/busy', true);
		BusyIndicator.show(0);
		try {
			const [version, details] = await Promise.all([
				this.getOwnerComponent().getVersionService().getVersion(this.versionId),
				this.getOwnerComponent().getDetailService().getDetails(this.versionId)
			]);
			model.setData({
				busy: false,
				version,
				details,
				selectedDetail: null,
				selectedDetailXml: '',
				selectedDetailBusy: false
			});
			if (details[0]) {
				await this.loadDetailXml(details[0]);
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	private async loadDetailXml(detail: RegistryDetail): Promise<void> {
		const model = this.getModel('versionDetail') as JSONModel;
		model.setProperty('/selectedDetailBusy', true);
		model.setProperty('/selectedDetail', detail);
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
}
