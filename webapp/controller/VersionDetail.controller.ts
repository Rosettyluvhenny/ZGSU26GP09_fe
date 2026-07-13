import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';
import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';

import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';
import type UI5Event from 'sap/ui/base/Event';
import type Table from 'sap/m/Table';
import type Tree from 'sap/m/Tree';

import BaseController from './BaseController';
import type { NodeTreeViewItem, RegistryDetail, XmlLineEntry } from '../model/types';
import { buildNodeTree, filterNodeTree, flattenNodeTree, offsetToLine, prettyPrintXml } from '../services/XmlNodeUtils';

interface ExtendedTreeBinding {
	expand(index: number): void;
	getLength(): number;
	isExpanded(index: number): boolean;
}

/**
 * @namespace com.zgp9.fe.controller
 */
export default class VersionDetail extends BaseController {
	private registryId: string | null = null;
	private versionId: string | null = null;
	private fullTree: NodeTreeViewItem[] = [];

	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				version: null,
				details: [],
				selectedDetail: null,
				selectedDetailXml: '',
				selectedDetailBusy: false,
				selectedNodeLine: 1,
				selectedDetailLineStarts: [],
				selectedDetailLines: [] as XmlLineEntry[],
				treeSearch: '',
				treeSearchMatchCount: 0
			}),
			'versionDetail'
		);
		this.setModel(new JSONModel([]), 'treeModel');
		this.getRouter()
			.getRoute("versionDetail")
			.attachPatternMatched((event) => {
				void this.onRouteMatched(event);
			});
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as Route$PatternMatchedEvent).getParameter('arguments') as { registryId?: string; versionId?: string; '?query'?: { detailId?: string } };
		this.registryId = args.registryId ?? null;
		this.versionId = args.versionId ?? null;
		const queryDetailId = args['?query']?.detailId ?? null;
		if (!this.registryId || !this.versionId) {
			return;
		}

		await this.loadVersion(queryDetailId);
	}

	public async onRefresh(): Promise<void> {
		await this.loadVersion();
	}

	public async onDetailChange(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getSelectedItem: () => { getBindingContext: (name?: string) => { getObject: () => RegistryDetail } | null } | null };
		const selectedItem = source.getSelectedItem();
		const context = selectedItem?.getBindingContext('versionDetail');
		const detail = context?.getObject();
		if (!detail) {
			return;
		}

		await this.loadDetailWorkspace(detail);
	}

	public onNodeSelectionChange(event: UI5Event): void {
		const listItem = (event as ListBase$ItemPressEvent).getParameter('listItem') as { getBindingContext: (name?: string) => { getObject: () => NodeTreeViewItem } | null } | null;
		const context = listItem?.getBindingContext('treeModel');
		const node = context?.getObject();
		if (!node) {
			return;
		}

		this.selectXmlLine(node.lineStart || offsetToLine(node.offsetStart, (this.getModel('versionDetail') as JSONModel).getProperty('/selectedDetailLineStarts') as number[]));
	}

	public onTreeSearch(event: UI5Event): void {
		const source = event.getSource() as unknown as { getValue: () => string };
		const query = (source.getValue() || '').trim().toLowerCase();
		const model = this.getModel('versionDetail') as JSONModel;
		const treeModel = this.getModel('treeModel') as JSONModel;

		if (!query) {
			model.setProperty('/treeSearchMatchCount', 0);
			treeModel.setData(this.fullTree);
			return;
		}

		const matchesQuery = (node: NodeTreeViewItem): boolean =>
			node.nodeName.toLowerCase().includes(query) || node.nodeType.toLowerCase().includes(query);

		const filteredTree = filterNodeTree(this.fullTree, matchesQuery);
		const matchCount = flattenNodeTree(filteredTree).filter(matchesQuery).length;

		model.setProperty('/treeSearchMatchCount', matchCount);
		treeModel.setData(filteredTree);
		this.expandAllTreeNodes('versionDetailTree');
	}

	public async onCopyXml(): Promise<void> {
		const model = this.getModel('versionDetail') as JSONModel;
		const xml = model.getProperty('/selectedDetailXml') as string;
		if (!xml) {
			MessageToast.show('No XML content to copy.');
			return;
		}

		const copied = await this.copyTextToClipboard(xml);
		MessageToast.show(copied ? 'XML copied to clipboard.' : 'Unable to copy XML.');
	}

	public onXmlLineSelectionChange(event: UI5Event): void {
		const source = event.getSource() as unknown as Table;
		const selectedItem = source.getSelectedItem();
		const context = selectedItem?.getBindingContext('versionDetail');
		const line = context?.getObject() as XmlLineEntry | undefined;
		if (!line) {
			return;
		}

		const model = this.getModel('versionDetail') as JSONModel;
		model.setProperty('/selectedNodeLine', line.lineNo);
	}

	private async loadVersion(queryDetailId: string | null = null): Promise<void> {
		if (!this.registryId || !this.versionId) {
			return;
		}

		const model = this.getModel('versionDetail') as JSONModel;
		model.setProperty('/busy', true);
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
				selectedDetailBusy: false,
				selectedNodeLine: 1,
				selectedDetailLineStarts: [],
				selectedDetailLines: [],
				treeSearch: '',
				treeSearchMatchCount: 0
			});
			this.fullTree = [];
			(this.getModel('treeModel') as JSONModel).setData([]);
			if (details.length > 0) {
				const detailToLoad = queryDetailId ? details.find(d => d.id === queryDetailId) || details[0] : details[0];
				await this.loadDetailWorkspace(detailToLoad);
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}

	private async loadDetailWorkspace(detail: RegistryDetail): Promise<void> {
		const model = this.getModel('versionDetail') as JSONModel;
		model.setProperty('/selectedDetailBusy', true);
		model.setProperty('/selectedDetail', detail);
		model.setProperty('/selectedDetailXml', '');
		model.setProperty('/treeSearch', '');
		model.setProperty('/treeSearchMatchCount', 0);
		this.fullTree = [];
		(this.getModel('treeModel') as JSONModel).setData([]);
		model.setProperty('/selectedDetailLineStarts', []);
		model.setProperty('/selectedDetailLines', []);
		try {
			const [loadedDetail, parsedDetail, nodeTree] = await Promise.all([
				this.getOwnerComponent().getDetailService().getDetail(detail.id),
				this.getOwnerComponent().getDetailService().getParsedDetail(detail.id),
				this.getOwnerComponent().getDetailService().getNodeTree(detail.id)
			]);
			let rawXml = parsedDetail.metadataXml || loadedDetail.xml || '';
			// Filter out XML declaration because the backend offsets do not include it
			rawXml = rawXml.replace(/<\?xml[^>]*\?>\s*/gi, '');
			const { prettyXml, rawOffsets } = prettyPrintXml(rawXml);
			const tree = buildNodeTree(nodeTree);
			const root = tree.length > 0 ? tree : this.createFallbackNodeTree(loadedDetail);
			this.applyLineNumbers(root, rawOffsets, prettyXml);
			this.fullTree = root;
			model.setProperty('/selectedDetailXml', prettyXml);
			(this.getModel('treeModel') as JSONModel).setData(root);
			model.setProperty('/selectedDetailLineStarts', rawOffsets);
			model.setProperty('/selectedDetailLines', this.buildXmlLines(prettyXml));
			model.setProperty('/selectedNodeLine', 1);
			this.selectXmlLine(1);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/selectedDetailBusy', false);
		}
	}

	private expandAllTreeNodes(treeId: string): void {
		const tree = this.byId(treeId) as Tree;
		if (!tree) {
			return;
		}

		tree.attachEventOnce('updateFinished', () => {
			const binding = tree.getBinding('items') as unknown as ExtendedTreeBinding;
			if (!binding || typeof binding.expand !== 'function') {
				return;
			}

			let index = 0;
			let iterations = 0;
			while (index < binding.getLength() && iterations < 100000) {
				iterations += 1;
				if (typeof binding.isExpanded === 'function' && !binding.isExpanded(index)) {
					binding.expand(index);
				}
				index += 1;
			}
		});
	}

	private async copyTextToClipboard(text: string): Promise<boolean> {
		if (navigator.clipboard && window.isSecureContext) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch {
				// fall through to the legacy fallback below
			}
		}

		try {
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.style.position = 'fixed';
			textarea.style.opacity = '0';
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();
			const success = document.execCommand('copy');
			document.body.removeChild(textarea);
			return success;
		} catch {
			return false;
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

	private applyLineNumbers(nodes: NodeTreeViewItem[], lineStarts: number[], xml: string): void {
		for (const node of nodes) {
			node.lineStart = offsetToLine(node.offsetStart, lineStarts);
			node.lineEnd = offsetToLine(node.offsetEnd, lineStarts);
			if (node.lineStart <= 1 && xml.length > 0) {
				node.lineStart = 1;
			}
			if (node.children.length > 0) {
				this.applyLineNumbers(node.children, lineStarts, xml);
			}
		}
	}

	private buildXmlLines(xml: string): XmlLineEntry[] {
		return xml.split('\n').map((text, index) => ({
			lineNo: index + 1,
			text,
			isWhitespace: text.trim().length === 0
		}));
	}

	private selectXmlLine(lineNo: number): void {
		const model = this.getModel('versionDetail') as JSONModel;
		model.setProperty('/selectedNodeLine', lineNo);
		const table = this.byId('selectedDetailXmlTable') as Table | null;
		if (!table) {
			return;
		}

		const triggerGrowToLine = () => {
			type TableWithGrowing = {
				getGrowingInfo?: () => { actual?: number };
				_oGrowingDelegate?: { requestNewPage?: () => void };
			};
			const growingTable = table as unknown as TableWithGrowing;
			const growingInfo = growingTable.getGrowingInfo?.();
			const currentActual = growingInfo?.actual || 0;

			if (lineNo > currentActual) {
				const delegate = growingTable._oGrowingDelegate;
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

			// Item should be rendered now, give it a tiny bit of time for DOM layout
			setTimeout(() => {
				this.scrollToItem(table, lineNo);
			}, 100);
		};

		triggerGrowToLine();
	}

	// private scrollXmlToLine(line: number): void {
	// 	this.selectXmlLine(line);
	// }

	private scrollToItem(table: Table, lineNo: number): void {
		// Clear previous highlights
		table.getItems().forEach((item) => {
			item.removeStyleClass('versionDetailXmlHighlighted');
		});

		const item = table.getItems().find((listItem) => {
			const context = listItem.getBindingContext('versionDetail');
			return (context?.getObject() as XmlLineEntry | null)?.lineNo === lineNo;
		});
		if (item) {
			item.addStyleClass('versionDetailXmlHighlighted');
			item.getDomRef()?.scrollIntoView({ block: 'center', inline: 'nearest' });
		}
	}
}
