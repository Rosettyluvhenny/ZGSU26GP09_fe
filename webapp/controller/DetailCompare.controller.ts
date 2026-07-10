import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';
import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';
import TreeTable from 'sap/ui/table/TreeTable';
import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';

import History from 'sap/ui/core/routing/History';
import type Table from 'sap/m/Table';

import BaseController from './BaseController';
interface ExtendedTreeBinding {
	expand(index: number): void;
	getLength(): number;
	getContextByIndex(index: number): { getObject: () => NodeTreeViewItem } | undefined;
	isExpanded(index: number): boolean;
	getMetadata?(): { getName(): string };
}

import type { NodeTreeViewItem, RegistryDetail, XmlLineEntry } from '../model/types';
import { applyNodeDiffStatus, buildNodeTree, offsetToLine, prettyPrintXml } from '../services/XmlNodeUtils';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class DetailCompare extends BaseController {
	private registryId: string | null = null;
	private leftVersionId: string | null = null;
	private rightVersionId: string | null = null;
	private baseDetailId: string | null = null;
	private compareDetailId: string | null = null;
	private treeScrollSyncAttached = false;
	private xmlScrollSyncAttached = false;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				compareWorkspaceBusy: false,
				baseDetail: null,
				compareDetail: null,
				baseTree: [],
				compareTree: [],
				baseXmlLines: [] as XmlLineEntry[],
				compareXmlLines: [] as XmlLineEntry[],
				baseLineStarts: [],
				compareLineStarts: [],
				compareNodeDiff: []
			}),
			'detailCompare'
		);
		this.getRouter()
			.getRoute("detailCompare")
			.attachPatternMatched((event) => {
				void this.onRouteMatched(event);
			});
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as Route$PatternMatchedEvent).getParameter('arguments') as { registryId?: string; leftVersionId?: string; rightVersionId?: string; baseDetailId?: string; compareDetailId?: string };
		this.registryId = args.registryId ?? null;
		this.leftVersionId = args.leftVersionId ?? null;
		this.rightVersionId = args.rightVersionId ?? null;
		this.baseDetailId = args.baseDetailId ?? null;
		this.compareDetailId = args.compareDetailId ?? null;

		if (!this.registryId || !this.leftVersionId || !this.rightVersionId || !this.baseDetailId || !this.compareDetailId) {
			return;
		}

		await this.loadCompareWorkspace();
	}

	public onAfterRendering(): void {
		this.attachScrollSync('baseTreeScroll', 'compareTreeScroll', true);
		this.attachScrollSync('baseXmlScroll', 'compareXmlScroll', false);
	}

	public onNavBack(): void {
		const previousHash = History.getInstance().getPreviousHash();
		if (previousHash !== undefined && previousHash !== '') {
			window.history.go(-1);
		} else {
			if (this.registryId && this.leftVersionId && this.rightVersionId) {
				this.getRouter().navTo('versionCompare', {
					registryId: this.registryId,
					leftVersionId: this.leftVersionId,
					rightVersionId: this.rightVersionId
				}, undefined, true);
			} else {
				this.getRouter().navTo('home', {}, undefined, true);
			}
		}
	}

	public onBaseTreeSelectionChange(event: UI5Event): void {
		const node = this.getNodeFromEvent(event);
		if (!node) {
			return;
		}

		this.selectXmlLine('baseDetailXmlTable', node.lineStart || offsetToLine(node.offsetStart, this.getLineStarts('/baseLineStarts')));
	}

	public onCompareTreeSelectionChange(event: UI5Event): void {
		const node = this.getNodeFromEvent(event);
		if (!node) {
			return;
		}

		this.selectXmlLine('compareDetailXmlTable', node.lineStart || offsetToLine(node.offsetStart, this.getLineStarts('/compareLineStarts')));
	}

	private async loadCompareWorkspace(): Promise<void> {
		if (!this.baseDetailId || !this.compareDetailId) {
			return;
		}

		const model = this.getModel('detailCompare') as JSONModel;
		model.setProperty('/baseDetailId', this.baseDetailId);
		model.setProperty('/compareDetailId', this.compareDetailId);
		model.setProperty('/compareWorkspaceBusy', true);
		model.setProperty('/baseTree', []);
		model.setProperty('/compareTree', []);
		BusyIndicator.show(0);
		try {
			const [baseDetail, compareDetail, baseParsedDetail, compareParsedDetail, baseNodeTree, compareNodeTree, compareNodeDiff] = await Promise.all([
				this.getOwnerComponent().getDetailService().getDetail(this.baseDetailId),
				this.getOwnerComponent().getDetailService().getDetail(this.compareDetailId),
				this.getOwnerComponent().getDetailService().getParsedDetail(this.baseDetailId),
				this.getOwnerComponent().getDetailService().getParsedDetail(this.compareDetailId),
				this.getOwnerComponent().getDetailService().getNodeTree(this.baseDetailId),
				this.getOwnerComponent().getDetailService().getNodeTree(this.compareDetailId),
				this.getOwnerComponent().getDetailService().compareNodeTree(this.baseDetailId, this.compareDetailId)
			]);

			let baseRawXml = baseParsedDetail.metadataXml || baseDetail.xml || '';
			baseRawXml = baseRawXml.replace(/<\?xml[^>]*\?>\s*/gi, '');
			const { prettyXml: baseXml, rawOffsets: baseLineStarts } = prettyPrintXml(baseRawXml);

			let compareRawXml = compareParsedDetail.metadataXml || compareDetail.xml || '';
			compareRawXml = compareRawXml.replace(/<\?xml[^>]*\?>\s*/gi, '');
			const { prettyXml: compareXml, rawOffsets: compareLineStarts } = prettyPrintXml(compareRawXml);

			const baseTreeRaw = buildNodeTree(baseNodeTree);
			const baseTree = baseTreeRaw.length > 0 ? baseTreeRaw : this.createFallbackNodeTree(baseDetail);

			const compareTreeRaw = buildNodeTree(compareNodeTree);
			const compareTree = compareTreeRaw.length > 0 ? compareTreeRaw : this.createFallbackNodeTree(compareDetail);

			const diffMap = new Map(compareNodeDiff.map((item) => [item.SEMANTIC_ID, item.STATUS]));

			this.applyLineNumbers(baseTree, baseLineStarts);
			this.applyLineNumbers(compareTree, compareLineStarts);

			const compareTreeMapped = applyNodeDiffStatus(compareTree, diffMap);

			model.setProperty('/baseDetail', baseDetail);
			model.setProperty('/compareDetail', compareDetail);
			model.setProperty('/baseXmlLines', this.buildXmlLines(baseXml));
			model.setProperty('/compareXmlLines', this.buildXmlLines(compareXml));
			model.setProperty('/baseTree', baseTree);
			model.setProperty('/compareTree', compareTreeMapped);
			model.setProperty('/baseLineStarts', baseLineStarts);
			model.setProperty('/compareLineStarts', compareLineStarts);
			model.setProperty('/compareNodeDiff', compareNodeDiff);

			const newDiff = await this.getOwnerComponent().getDetailService().compareDetail(this.baseDetailId, this.compareDetailId);
			console.log('compareDetail API result (newDiff):', newDiff);

			if (newDiff) {
				const newDiffMap = new Map<string, string>();
				newDiff.forEach((item) => {
					newDiffMap.set(item.SEMANTIC_ID, item.STATUS);
					if (item.ATTRIBUTEDIFF && Array.isArray(item.ATTRIBUTEDIFF)) {
						item.ATTRIBUTEDIFF.forEach((attr) => {
							newDiffMap.set(`${item.SEMANTIC_ID}/${attr.NAME}`, attr.STATUS);
						});
					}
				});
				console.log('Mapped diff statuses:', Array.from(newDiffMap.entries()));

				const mapHighlight = (status?: string) => {
					if (status === 'MODIFIED') return 'Warning'; // Yellow
					if (status === 'ADDED') return 'Success'; // Green
					if (status === 'DELETED') return 'Error'; // Red
					return 'None';
				};
				const applyHighlight = (nodes: NodeTreeViewItem[], parentStatus?: string, isParentHighlighted = false): boolean => {
					let anyExpanded = false;
					for (const node of nodes) {
						let status = newDiffMap.get(node.semanticId);

						// Inherit status for attributes if they don't have their own diff status
						if ((node.isAttribute || node.isAttributeGroup) && !status && parentStatus) {
							status = parentStatus;
						}

						node.highlight = mapHighlight(status);

						const thisNodeHighlighted = node.highlight !== 'None';
						const effectivelyHighlightedParent = isParentHighlighted || thisNodeHighlighted;

						let childrenExpanded = false;
						if (node.children && node.children.length > 0) {
							childrenExpanded = applyHighlight(node.children, status, effectivelyHighlightedParent);
						}

						if (childrenExpanded) {
							node.shouldExpand = true;
							anyExpanded = true;
						} else if (thisNodeHighlighted && !isParentHighlighted) {
							node.shouldExpand = true;
							anyExpanded = true;
						} else {
							node.shouldExpand = false;
						}
					}
					return anyExpanded;
				};

				applyHighlight(baseTree);
				applyHighlight(compareTreeMapped);

				model.setProperty('/baseTree', baseTree);
				model.setProperty('/compareTree', compareTreeMapped);

				this.scheduleTreeExpansion('baseTree');
				this.scheduleTreeExpansion('compareTree');

				model.refresh(true);
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/compareWorkspaceBusy', false);
			BusyIndicator.hide();
		}
	}



	private scheduleTreeExpansion(treeId: string): void {
		const tree = this.byId(treeId) as TreeTable;
		console.log(`[scheduleTreeExpansion] looking for "${treeId}"`, tree);
		if (!tree) return;

		tree.attachEventOnce('updateFinished', () => {
			const binding = tree.getBinding('items') as unknown as ExtendedTreeBinding;
			console.log(`[scheduleTreeExpansion] updateFinished fired for "${treeId}"`);
			console.log(`[scheduleTreeExpansion] binding type`, binding?.getMetadata?.().getName());

			if (!binding || typeof binding.expand !== 'function') {
				console.warn(`[scheduleTreeExpansion] missing binding or expand function`);
				return;
			}

			let i = 0;
			let limit = 0;
			const length = binding.getLength();
			console.log(`[scheduleTreeExpansion] starting loop... length:`, length);

			while (i < binding.getLength() && limit < 100000) {
				limit++;
				const context = binding.getContextByIndex(i);
				const node = context?.getObject();

				if (node && node.shouldExpand && node.children && node.children.length > 0) {
					if (typeof binding.isExpanded === 'function' && !binding.isExpanded(i)) {
						console.log(`[scheduleTreeExpansion] expanding node at index ${i}:`, node.label || node.nodeName);
						binding.expand(i);
					}
				}
				i++;
			}
			console.log(`[scheduleTreeExpansion] loop finished after ${limit} iterations. New length:`, binding.getLength());
		});
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

		return domRef.querySelector('.sapMScrollContScroll');
	}

	private getNodeFromEvent(event: UI5Event): NodeTreeViewItem | null {
		const item = (event as ListBase$ItemPressEvent).getParameter('listItem') as { getBindingContext: (name?: string) => { getObject: () => NodeTreeViewItem } | null } | null;
		const context = item?.getBindingContext('detailCompare');
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

	private selectXmlLine(tableId: string, lineNo: number): void {
		const table = this.byId(tableId) as Table | null;
		if (!table) {
			return;
		}

		const triggerGrowToLine = () => {
			const tableExtended = table as unknown as {
				getGrowingInfo?: () => { actual?: number } | undefined;
				_oGrowingDelegate?: { requestNewPage?: () => void };
			};
			const growingInfo = tableExtended.getGrowingInfo?.();
			const currentActual = growingInfo?.actual || 0;

			if (lineNo > currentActual) {
				const delegate = tableExtended._oGrowingDelegate;
				if (delegate && typeof delegate.requestNewPage === 'function') {
					const onUpdateFinished = () => {
						table.detachEvent('updateFinished', onUpdateFinished);
						triggerGrowToLine();
					};
					table.attachEvent('updateFinished', onUpdateFinished);
					delegate.requestNewPage();
					return;
				}
			}

			setTimeout(() => {
				this.scrollToItem(table, lineNo);
			}, 100);
		};

		triggerGrowToLine();
	}

	private scrollToItem(table: Table, lineNo: number): void {
		table.getItems().forEach((item) => {
			item.removeStyleClass('versionDetailXmlHighlighted');
		});

		const item = table.getItems().find((listItem) => {
			const context = listItem.getBindingContext('detailCompare');
			return (context?.getObject() as XmlLineEntry | null)?.lineNo === lineNo;
		});
		if (item) {
			item.addStyleClass('versionDetailXmlHighlighted');
			item.getDomRef()?.scrollIntoView({ block: 'center', inline: 'nearest' });
		}
	}

	private createFallbackNodeTree(detail: RegistryDetail): NodeTreeViewItem[] {
		return buildNodeTree([
			{
				nodeId: detail.id,
				semanticId: detail.serviceDefinition || detail.id,
				parentId: '',
				nodePath: '1',
				nodeType: 'Detail',
				nodeName: detail.serviceDefinition || 'Detail',
				nodeAlias: '',
				offsetStart: 0,
				offsetEnd: detail.xml.length,
				seq: 1,
				depth: 0,
				attributes: []
			}
		]);
	}

	private buildXmlLines(xml: string): XmlLineEntry[] {
		return xml.split('\n').map((text, index) => ({
			lineNo: index + 1,
			text,
			isWhitespace: text.trim().length === 0
		}));
	}

	private getLineStarts(path: string): number[] {
		const model = this.getModel('detailCompare') as JSONModel;
		return (model.getProperty(path) as number[]) ?? [];
	}
}
