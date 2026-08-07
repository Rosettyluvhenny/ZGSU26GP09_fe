import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';
import type UI5Event from 'sap/ui/base/Event';
import JSONModel from 'sap/ui/model/json/JSONModel';
import History from 'sap/ui/core/routing/History';

import BaseController from './BaseController';
import type { CompareVersionEntry } from '../model/types';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class VersionCompare extends BaseController {
	private registryId: string | null = null;
	private leftVersionId: string | null = null;
	private rightVersionId: string | null = null;

	public onInit(): void {
		const model = new JSONModel({
			busy: false,
			result: null,
			change: [],
			differ: [],
			unchange: [],
			changeCount: 0,
			differCount: 0,
			unchangeCount: 0,
			baseDetail: null,
			compareDetail: null,
			baseTree: [],
			compareTree: [],
			baseXml: '',
			compareXml: '',
			baseLineStarts: [],
			compareLineStarts: [],
			selectedCompareEntry: null,

		});
		// Growing tables are still capped by JSONModel sizeLimit (default 100).
		model.setSizeLimit(5000);
		this.setModel(model, 'versionCompare');
		this.getRouter()
			.getRoute("versionCompare")
			.attachPatternMatched((event: Route$PatternMatchedEvent) => {
				void this.onRouteMatched(event);
			});
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as Route$PatternMatchedEvent).getParameter('arguments') as { registryId?: string; leftVersionId?: string; rightVersionId?: string };
		this.registryId = args.registryId ?? null;
		this.leftVersionId = args.leftVersionId ?? null;
		this.rightVersionId = args.rightVersionId ?? null;
		if (!this.registryId || !this.leftVersionId || !this.rightVersionId) {
			return;
		}

		await this.loadComparison();
	}

	public onNavBack(): void {
		// Prefer browser history (same as RegistryDetail) so Back returns to the real
		// previous screen instead of replace-nav stacking VersionCompare in history.
		const previousHash = History.getInstance().getPreviousHash();
		if (previousHash !== undefined && previousHash !== '') {
			window.history.go(-1);
			return;
		}
		if (this.registryId) {
			this.navTo('registryDetail', { registryId: this.registryId }, true);
		} else {
			this.navTo('registryList', {}, true);
		}
	}

	public onViewDetail(event: UI5Event): void {
		const entry = this.getCompareEntryFromEvent(event);
		if (!entry || !this.registryId || !this.leftVersionId || !this.rightVersionId) {
			return;
		}

		if (!this.isValidDetailId(entry.baseDetailId) || !this.isValidDetailId(entry.compareDetailId)) {
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

	public onViewDifferentDetail(event: UI5Event): void {
		const entry = this.getCompareEntryFromEvent(event);
		if (!entry || !this.registryId) {
			return;
		}

		const isBaseValid = this.isValidDetailId(entry.baseDetailId);
		const validDetailId = isBaseValid ? entry.baseDetailId : entry.compareDetailId;
		const targetVersionId = isBaseValid ? this.leftVersionId : this.rightVersionId;

		if (!this.isValidDetailId(validDetailId) || !targetVersionId) {
			return;
		}

		this.getRouter().navTo('versionDetail', {
			registryId: this.registryId,
			versionId: targetVersionId,
			query: {
				detailId: validDetailId
			}
		});
	}

	// Tree selection and scrolling logic removed as it belongs to DetailCompare

	private isValidDetailId(detailId?: string | null): detailId is string {
		if (!detailId || !detailId.trim()) {
			return false;
		}
		const normalized = detailId.replace(/[{}]/g, '').trim().toLowerCase();
		return normalized !== '00000000-0000-0000-0000-000000000000';
	}
	private async loadComparison(): Promise<void> {
		if (!this.registryId || !this.leftVersionId || !this.rightVersionId) {
			return;
		}

		const model = this.getModel('versionCompare') as JSONModel;
		model.setProperty('/busy', true);
		try {
			const result = (await this.getOwnerComponent().getVersionService().compareVersions(this.leftVersionId, this.rightVersionId));
			model.setProperty('/result', result);
			model.setProperty('/change', result.change);
			model.setProperty('/differ', result.differ);
			model.setProperty('/unchange', result.unchange);
			model.setProperty('/changeCount', result.change.length);
			model.setProperty('/differCount', result.differ.length);
			model.setProperty('/unchangeCount', result.unchange.length);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}

	private getCompareEntryFromEvent(event: UI5Event): CompareVersionEntry | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => CompareVersionEntry } | null };
		const context = source.getBindingContext('versionCompare');
		return context?.getObject() ?? null;
	}
}
