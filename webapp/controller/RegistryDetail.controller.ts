import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { Registry, RegistryVersion } from '../model/types';

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
				versions: []
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
		try {
			const [registry, versions] = await Promise.all([
				this.getOwnerComponent().getRegistryService().getRegistry(this.registryId),
				this.getOwnerComponent().getVersionService().getVersions(this.registryId)
			]);
			model.setData({
				busy: false,
				registry,
				versions
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
}
