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
				compareNodeDiff: [],
				compareWorkspaceBusy: false
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
		this.attachScrollSync('baseTreeScroll', 'compareTreeScroll', true);
		this.attachScrollSync('baseXmlScroll', 'compareXmlScroll', false);
	}

	public onCopyLeftXml(): void {
		const model = this.getModel('versionCompare') as JSONModel;
		navigator.clipboard.writeText(model.getProperty('/baseXml') as string).then(() => MessageToast.show('Left XML copied.'));
	}

	public onCopyRightXml(): void {
		const model = this.getModel('versionCompare') as JSONModel;
		navigator.clipboard.writeText(model.getProperty('/compareXml') as string).then(() => MessageToast.show('Right XML copied.'));
	}

	public async onViewDetail(event: UI5Event): Promise<void> {
		const entry = this.getCompareEntryFromEvent(event);
		if (!entry) {
			return;
		}

		await this.loadCompareWorkspace(entry);
	}

	public onBaseTreeSelectionChange(event: UI5Event): void {
		const node = this.getNodeFromEvent(event);
		if (!node) {
			return;
		}

		this.scrollXmlPane('baseXmlScroll', node.lineStart || offsetToLine(node.offsetStart, this.getLineStarts('/baseLineStarts')));
	}

	public onCompareTreeSelectionChange(event: UI5Event): void {
		const node = this.getNodeFromEvent(event);
		if (!node) {
			return;
		}

		this.scrollXmlPane('compareXmlScroll', node.lineStart || offsetToLine(node.offsetStart, this.getLineStarts('/compareLineStarts')));
	}

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
			if (result.change[0] || result.differ[0]) {
				await this.loadCompareWorkspace(result.change[0] ?? result.differ[0]);
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	private async loadCompareWorkspace(entry: CompareVersionEntry): Promise<void> {
		const model = this.getModel('versionCompare') as JSONModel;
		model.setProperty('/compareWorkspaceBusy', true);
		model.setProperty('/selectedCompareEntry', entry);
		BusyIndicator.show(0);
		try {
			const [baseDetail, compareDetail, baseNodeTree, compareNodeTree, compareNodeDiff] = await Promise.all([
				this.getOwnerComponent().getDetailService().getDetail(entry.baseDetailId),
				this.getOwnerComponent().getDetailService().getDetail(entry.compareDetailId),
				this.getOwnerComponent().getDetailService().getNodeTree(entry.baseDetailId),
				this.getOwnerComponent().getDetailService().getNodeTree(entry.compareDetailId),
				this.getOwnerComponent().getDetailService().compareNodeTree(entry.baseDetailId, entry.compareDetailId)
			]);

			const baseXml = prettyPrintXml(baseDetail.xml);
			const compareXml = prettyPrintXml(compareDetail.xml);
			const baseLineMap = buildXmlLineMap(baseXml);
			const compareLineMap = buildXmlLineMap(compareXml);
			const baseTree = buildNodeTree(baseNodeTree);
			const compareTree = buildNodeTree(compareNodeTree);
			const diffMap = new Map(compareNodeDiff.map((item) => [item.SEMANTIC_ID, item.STATUS]));

			this.applyLineNumbers(baseTree, baseLineMap.lineStarts);
			this.applyLineNumbers(compareTree, compareLineMap.lineStarts);

			model.setProperty('/baseDetail', baseDetail);
			model.setProperty('/compareDetail', compareDetail);
			model.setProperty('/baseXml', baseXml);
			model.setProperty('/compareXml', compareXml);
			model.setProperty('/baseTree', baseTree);
			model.setProperty('/compareTree', applyNodeDiffStatus(compareTree, diffMap));
			model.setProperty('/baseLineStarts', baseLineMap.lineStarts);
			model.setProperty('/compareLineStarts', compareLineMap.lineStarts);
			model.setProperty('/compareNodeDiff', compareNodeDiff);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/compareWorkspaceBusy', false);
			BusyIndicator.hide();
		}
	}

	private attachScrollSync(leftId: string, rightId: string, treeMode: boolean): void {
		if (treeMode ? this.treeScrollSyncAttached : this.xmlScrollSyncAttached) {
			return;
		}

		const left = this.findScrollElement(leftId, treeMode);
		const right = this.findScrollElement(rightId, treeMode);
		if (!left || !right) {
			return;
		}

		if (treeMode) {
			this.treeScrollSyncAttached = true;
		} else {
			this.xmlScrollSyncAttached = true;
		}

		let syncing = false;
		const sync = (source: HTMLElement, target: HTMLElement): void => {
			if (syncing) {
				return;
			}
			syncing = true;
			target.scrollTop = source.scrollTop;
			target.scrollLeft = source.scrollLeft;
			window.requestAnimationFrame(() => {
				syncing = false;
			});
		};

		left.addEventListener('scroll', () => sync(left, right));
		right.addEventListener('scroll', () => sync(right, left));
	}

	private findScrollElement(controlId: string, treeMode: boolean): HTMLElement | null {
		const domRef = this.byId(controlId)?.getDomRef();
		if (!domRef) {
			return null;
		}

		return treeMode ? (domRef.querySelector('.sapMScrollContScroll') as HTMLElement | null) : (domRef.querySelector('textarea') as HTMLElement | null);
	}

	private getCompareEntryFromEvent(event: UI5Event): CompareVersionEntry | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => CompareVersionEntry } | null };
		const context = source.getBindingContext('versionCompare');
		return context?.getObject() ?? null;
	}

	private getNodeFromEvent(event: UI5Event): NodeTreeViewItem | null {
		const item = (event as any).getParameter('listItem') as { getBindingContext: (name?: string) => { getObject: () => NodeTreeViewItem } | null } | null;
		const context = item?.getBindingContext('versionCompare');
		return context?.getObject() ?? null;
	}

	private applyLineNumbers(nodes: NodeTreeViewItem[], lineStarts: number[]): void {
		for (const node of nodes) {
			node.lineStart = offsetToLine(node.offsetStart, lineStarts);
			node.lineEnd = offsetToLine(node.offsetEnd, lineStarts);
			if (node.children.length > 0) {
				this.applyLineNumbers(node.children, lineStarts);
			}
		}
	}

	private scrollXmlPane(paneId: string, line: number): void {
		const textArea = this.byId(paneId)?.getDomRef()?.querySelector('textarea') as HTMLTextAreaElement | null;
		if (!textArea) {
			return;
		}

		const computed = window.getComputedStyle(textArea);
		const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.4 || 18;
		textArea.scrollTop = Math.max(0, (line - 1) * lineHeight - lineHeight * 2);
	}

	private getLineStarts(path: string): number[] {
		const model = this.getModel('versionCompare') as JSONModel;
		return (model.getProperty(path) as number[]) ?? [];
	}
}
