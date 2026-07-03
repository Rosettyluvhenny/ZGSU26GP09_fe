import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { RegistryVersion } from '../model/types';

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
				compareBase: '',
				compareTarget: ''
			}),
			'registryDetail'
		);
		this.getRouter().getRoute('registryDetail').attachPatternMatched(this.onRouteMatched, this);
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const argumentsData = (event as any).getParameter('arguments') as { registryId?: string };
		this.registryId = argumentsData.registryId ?? null;
		if (!this.registryId) {
			return;
		}

		await this.loadRegistry();
	}

	public async onRefresh(): Promise<void> {
		await this.loadRegistry();
	}

	public onViewVersion(event: UI5Event): void {
		const version = this.getVersionFromEvent(event);
		if (!version || !this.registryId) {
			return;
		}

		this.navTo('versionDetail', { registryId: this.registryId, versionId: version.id });
	}

	public onDownloadXml(event: UI5Event): void {
		const version = this.getVersionFromEvent(event);
		if (!version) {
			return;
		}

		this.downloadText(version.xml, `${version.versionNumber}.xml`);
	}

	public onCompareVersion(event: UI5Event): void {
		const version = this.getVersionFromEvent(event);
		if (!version || !this.registryId) {
			return;
		}

		const model = this.getModel('registryDetail') as JSONModel;
		const compareBase = (model.getProperty('/compareBase') as string) || version.id;
		const compareTarget = (model.getProperty('/compareTarget') as string) || this.getLatestVersionId(model);
		if (!compareBase || !compareTarget || compareBase === compareTarget) {
			return;
		}

		this.navTo('versionCompare', {
			registryId: this.registryId,
			leftVersionId: compareBase,
			rightVersionId: compareTarget
		});
	}

	public onCompareSelectionChange(): void {
		const model = this.getModel('registryDetail') as JSONModel;
		const base = model.getProperty('/compareBase') as string;
		const target = model.getProperty('/compareTarget') as string;
		model.setProperty('/compareEnabled', Boolean(base && target && base !== target));
	}

	public async onCompareSelectedVersions(): Promise<void> {
		if (!this.registryId) {
			return;
		}

		const model = this.getModel('registryDetail') as JSONModel;
		const leftVersionId = model.getProperty('/compareBase') as string;
		const rightVersionId = model.getProperty('/compareTarget') as string;
		if (!leftVersionId || !rightVersionId || leftVersionId === rightVersionId) {
			return;
		}

		this.navTo('versionCompare', {
			registryId: this.registryId,
			leftVersionId,
			rightVersionId
		});
	}

	private async loadRegistry(): Promise<void> {
		if (!this.registryId) {
			return;
		}

		const model = this.getModel('registryDetail') as JSONModel;
		model.setProperty('/busy', true);
		try {
			const [registry, versions] = await Promise.all([
				this.getOwnerComponent().getRegistryService().getRegistry(this.registryId),
				this.getOwnerComponent().getVersionService().getVersions(this.registryId)
			]);
			model.setData({
				busy: false,
				registry,
				versions,
				compareBase: versions[versions.length - 2]?.id ?? versions[0]?.id ?? '',
				compareTarget: versions[versions.length - 1]?.id ?? versions[0]?.id ?? ''
			});
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}

	private getVersionFromEvent(event: UI5Event): RegistryVersion | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => RegistryVersion } | null };
		const context = source.getBindingContext('registryDetail');
		return context?.getObject() ?? null;
	}

	private getLatestVersionId(model: JSONModel): string {
		const versions = model.getProperty('/versions') as RegistryVersion[];
		return versions[versions.length - 1]?.id ?? '';
	}

	private downloadText(text: string, fileName: string): void {
		const blob = new Blob([text], { type: 'application/xml;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		link.click();
		URL.revokeObjectURL(url);
	}
}
