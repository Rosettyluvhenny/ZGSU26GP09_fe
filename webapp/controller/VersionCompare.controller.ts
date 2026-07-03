import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';

import BaseController from './BaseController';
import type { VersionComparisonResult } from '../services/VersionService';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class VersionCompare extends BaseController {
	private registryId: string | null = null;
	private leftVersionId: string | null = null;
	private rightVersionId: string | null = null;
	private scrollSyncAttached = false;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				result: null,
				structured: [],
				filteredStructured: [],
				showUnchanged: true,
				rawLeft: '',
				rawRight: ''
			}),
			'versionCompare'
		);
		this.getRouter().getRoute('versionCompare').attachPatternMatched(this.onRouteMatched, this);
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as any).getParameter('arguments') as { registryId?: string; leftVersionId?: string; rightVersionId?: string };
		this.registryId = args.registryId ?? null;
		this.leftVersionId = args.leftVersionId ?? null;
		this.rightVersionId = args.rightVersionId ?? null;
		if (!this.registryId || !this.leftVersionId || !this.rightVersionId) {
			return;
		}

		await this.loadComparison();
	}

	public onAfterRendering(): void {
		if (this.scrollSyncAttached) {
			return;
		}

		const left = this.byId('compareLeftXml')?.getDomRef()?.querySelector('textarea') as HTMLTextAreaElement | null;
		const right = this.byId('compareRightXml')?.getDomRef()?.querySelector('textarea') as HTMLTextAreaElement | null;
		if (!left || !right) {
			return;
		}

		this.scrollSyncAttached = true;
		left.addEventListener('scroll', () => {
			right.scrollTop = left.scrollTop;
			right.scrollLeft = left.scrollLeft;
		});
		right.addEventListener('scroll', () => {
			left.scrollTop = right.scrollTop;
			left.scrollLeft = right.scrollLeft;
		});
	}

	public onToggleUnchanged(): void {
		const model = this.getModel('versionCompare') as JSONModel;
		const showUnchanged = !(model.getProperty('/showUnchanged') as boolean);
		model.setProperty('/showUnchanged', showUnchanged);
		this.applyStructuredFilter();
	}

	public onCopyLeftXml(): void {
		const model = this.getModel('versionCompare') as JSONModel;
		navigator.clipboard.writeText(model.getProperty('/rawLeft') as string).then(() => MessageToast.show('Left XML copied.'));
	}

	public onCopyRightXml(): void {
		const model = this.getModel('versionCompare') as JSONModel;
		navigator.clipboard.writeText(model.getProperty('/rawRight') as string).then(() => MessageToast.show('Right XML copied.'));
	}

	private async loadComparison(): Promise<void> {
		if (!this.registryId || !this.leftVersionId || !this.rightVersionId) {
			return;
		}

		const model = this.getModel('versionCompare') as JSONModel;
		model.setProperty('/busy', true);
		BusyIndicator.show(0);
		try {
			const result = (await this.getOwnerComponent().getVersionService().compareVersions(
				this.leftVersionId,
				this.rightVersionId
			)) as VersionComparisonResult;
			model.setProperty('/result', result);
			model.setProperty('/structured', result.structured);
			model.setProperty('/rawLeft', result.rawLeft);
			model.setProperty('/rawRight', result.rawRight);
			this.applyStructuredFilter();
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	private applyStructuredFilter(): void {
		const model = this.getModel('versionCompare') as JSONModel;
		const structured = (model.getProperty('/structured') as VersionComparisonResult['structured']) ?? [];
		const showUnchanged = model.getProperty('/showUnchanged') as boolean;
		model.setProperty(
			'/filteredStructured',
			showUnchanged ? structured : structured.filter((item) => item.status !== 'unchanged')
		);
	}
}
