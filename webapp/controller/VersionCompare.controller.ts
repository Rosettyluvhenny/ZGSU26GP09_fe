import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';

import BaseController from './BaseController';
import type { CompareVersionEntry, CompareVersionResult, NodeTreeViewItem } from '../model/types';
import { applyNodeDiffStatus, buildNodeTree, buildXmlLineMap, offsetToLine, prettyPrintXml } from '../services/XmlNodeUtils';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class VersionCompare extends BaseController {
	private registryId: string | null = null;
	private leftVersionId: string | null = null;
	private rightVersionId: string | null = null;
	private treeScrollSyncAttached = false;
	private xmlScrollSyncAttached = false;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				result: null,
				change: [],
				differ: [],
				unchange: [],
				baseDetail: null,
				compareDetail: null,
				baseTree: [],
				compareTree: [],
				baseXml: '',
				compareXml: '',
				baseLineStarts: [],
				compareLineStarts: [],
				selectedCompareEntry: null,
				compareLineStarts: [],
				selectedCompareEntry: null
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
		// Nothing to sync here anymore
	}

	public onCopyLeftXml(): void {
		const model = this.getModel('versionCompare') as JSONModel;
		navigator.clipboard.writeText(model.getProperty('/baseXml') as string).then(() => MessageToast.show('Left XML copied.'));
	}

	public onCopyRightXml(): void {
		const model = this.getModel('versionCompare') as JSONModel;
		navigator.clipboard.writeText(model.getProperty('/compareXml') as string).then(() => MessageToast.show('Right XML copied.'));
	}

	public onViewDetail(event: UI5Event): void {
		const entry = this.getCompareEntryFromEvent(event);
		if (!entry || !this.registryId || !this.leftVersionId || !this.rightVersionId) {
			return;
		}

		this.getRouter().navTo('detailCompare', {
			registryId: this.registryId,
			leftVersionId: this.leftVersionId,
			rightVersionId: this.rightVersionId,
			baseDetailId: entry.baseDetailId,
			compareDetailId: entry.compareDetailId
		});
	}

	// Tree selection and scrolling logic removed as it belongs to DetailCompare

	private async loadComparison(): Promise<void> {
		if (!this.registryId || !this.leftVersionId || !this.rightVersionId) {
			return;
		}

		const model = this.getModel('versionCompare') as JSONModel;
		model.setProperty('/busy', true);
		BusyIndicator.show(0);
		try {
			const result = (await this.getOwnerComponent().getVersionService().compareVersions(this.leftVersionId, this.rightVersionId)) as CompareVersionResult;
			model.setProperty('/result', result);
			model.setProperty('/change', result.change);
			model.setProperty('/differ', result.differ);
			model.setProperty('/unchange', result.unchange);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	private getCompareEntryFromEvent(event: UI5Event): CompareVersionEntry | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => CompareVersionEntry } | null };
		const context = source.getBindingContext('versionCompare');
		return context?.getObject() ?? null;
	}
}
