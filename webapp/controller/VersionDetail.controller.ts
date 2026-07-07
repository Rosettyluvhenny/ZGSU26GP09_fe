import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { NodeTreeViewItem, RegistryDetail } from '../model/types';
import { buildNodeTree, buildXmlLineMap, offsetToLine, prettyPrintXml } from '../services/XmlNodeUtils';

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
				selectedDetailBusy: false,
				selectedDetailTree: [],
				selectedNodeLine: 1,
				selectedDetailLineStarts: []
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

		await this.loadDetailWorkspace(detail);
	}

	public onNodeSelectionChange(event: UI5Event): void {
		const listItem = (event as any).getParameter('listItem') as { getBindingContext: (name?: string) => { getObject: () => NodeTreeViewItem } | null } | null;
		const context = listItem?.getBindingContext('versionDetail');
		const node = context?.getObject();
		if (!node) {
			return;
		}

		this.scrollXmlToLine(node.lineStart || offsetToLine(node.offsetStart, (this.getModel('versionDetail') as JSONModel).getProperty('/selectedDetailLineStarts') as number[]));
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
				selectedDetailBusy: false,
				selectedDetailTree: [],
				selectedNodeLine: 1,
				selectedDetailLineStarts: []
			});
			if (details[0]) {
				await this.loadDetailWorkspace(details[0]);
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	private async loadDetailWorkspace(detail: RegistryDetail): Promise<void> {
		const model = this.getModel('versionDetail') as JSONModel;
		model.setProperty('/selectedDetailBusy', true);
		model.setProperty('/selectedDetail', detail);
		model.setProperty('/selectedDetailXml', '');
		model.setProperty('/selectedDetailTree', []);
		model.setProperty('/selectedDetailLineStarts', []);
		BusyIndicator.show(0);
		try {
			const [loadedDetail, parsedDetail, nodeTree] = await Promise.all([
				this.getOwnerComponent().getDetailService().getDetail(detail.id),
				this.getOwnerComponent().getDetailService().getParsedDetail(detail.id),
				this.getOwnerComponent().getDetailService().getNodeTree(detail.id)
			]);
			const rawXml = parsedDetail.metadataXml || loadedDetail.xml || '';
			const prettyXml = prettyPrintXml(rawXml);
			const lineMap = buildXmlLineMap(prettyXml);
			const tree = buildNodeTree(nodeTree);
			const root = tree.length > 0 ? tree : this.createFallbackNodeTree(loadedDetail);
			this.applyLineNumbers(root, lineMap.lineStarts, prettyXml);
			model.setProperty('/selectedDetailXml', prettyXml);
			model.setProperty('/selectedDetailTree', root);
			model.setProperty('/selectedDetailLineStarts', lineMap.lineStarts);
			model.setProperty('/selectedNodeLine', 1);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/selectedDetailBusy', false);
			BusyIndicator.hide();
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

	private scrollXmlToLine(line: number): void {
		const textArea = this.byId('selectedDetailXmlArea')?.getDomRef()?.querySelector('textarea') as HTMLTextAreaElement | null;
		if (!textArea) {
			return;
		}

		const computed = window.getComputedStyle(textArea);
		const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.4 || 18;
		textArea.scrollTop = Math.max(0, (line - 1) * lineHeight - lineHeight * 2);
	}
}
