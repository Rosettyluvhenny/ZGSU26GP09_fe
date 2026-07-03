import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';

import BaseController from './BaseController';
import type { RegistryDetail } from '../model/types';

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

	public async onOpenDetail(event: UI5Event): Promise<void> {
		const detail = this.getDetailFromEvent(event);
		if (!detail) {
			return;
		}

		await this.loadDetailXml(detail);
	}

	public async onCopyXml(): Promise<void> {
		const model = this.getModel('versionDetail') as JSONModel;
		const xml = model.getProperty('/selectedDetailXml') as string;
		if (!xml) {
			MessageToast.show('Select a detail first.');
			return;
		}

		await navigator.clipboard.writeText(xml);
		MessageToast.show('XML copied to clipboard.');
	}

	public onDownloadXml(): void {
		const model = this.getModel('versionDetail') as JSONModel;
		const xml = model.getProperty('/selectedDetailXml') as string;
		const detail = model.getProperty('/selectedDetail') as RegistryDetail | null;
		if (!xml || !detail) {
			MessageToast.show('Select a detail first.');
			return;
		}

		const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${detail.id}.xml`;
		link.click();
		URL.revokeObjectURL(url);
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

	private getDetailFromEvent(event: UI5Event): RegistryDetail | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => RegistryDetail } | null };
		const context = source.getBindingContext('versionDetail');
		return context?.getObject() ?? null;
	}
}
