import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';
import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';

import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageToast from 'sap/m/MessageToast';
import MessageBox from 'sap/m/MessageBox';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import Fragment from 'sap/ui/core/Fragment';
import type Dialog from 'sap/m/Dialog';
import type UI5Event from 'sap/ui/base/Event';
import type Table from 'sap/m/Table';
import type Tree from 'sap/m/Tree';

import BaseController, { type AiChatContext } from './BaseController';
import type { nodeTreeViewItem, registryDetail, xmlLineEntry } from '../model/types';
import { buildNodeTree, filterNodeTree, flattenNodeTree, highlightXmlLine, offsetToLine, prettyPrintXml } from '../services/XmlNodeUtils';

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
	private fullTree: nodeTreeViewItem[] = [];
	private _sendMailDialog: Dialog | null = null;
	private highlightClearTimer: number | null = null;

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
				selectedDetailLines: [] as xmlLineEntry[],
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

	public onOpenModelExplorer(): void {
		if (!this.registryId || !this.versionId) {
			return;
		}
		const detail = (this.getModel('versionDetail') as JSONModel).getProperty('/selectedDetail') as registryDetail | null;
		this.getRouter().navTo('modelExplorer', {
			registryId: this.registryId,
			versionId: this.versionId,
			query: detail ? { detailId: detail.detailId } : {}
		});
	}

	public async onDetailChange(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getSelectedItem: () => { getBindingContext: (name?: string) => { getObject: () => registryDetail } | null } | null };
		const selectedItem = source.getSelectedItem();
		const context = selectedItem?.getBindingContext('versionDetail');
		const detail = context?.getObject();
		if (!detail) {
			return;
		}

		await this.loadDetailWorkspace(detail);
	}

	public onNodeSelectionChange(event: UI5Event): void {
		const listItem = (event as ListBase$ItemPressEvent).getParameter('listItem') as { getBindingContext: (name?: string) => { getObject: () => nodeTreeViewItem } | null } | null;
		const context = listItem?.getBindingContext('treeModel');
		const node = context?.getObject();
		if (!node) {
			return;
		}

		this.selectXmlLine(node.lineStart || offsetToLine(node.offsetStart, (this.getModel('versionDetail') as JSONModel).getProperty('/selectedDetailLineStarts') as number[]));
		// Clear selection so clicking the same node again re-fires selectionChange + flash.
		const tree = event.getSource() as unknown as { removeSelections?: (b?: boolean) => void };
		window.setTimeout(() => tree.removeSelections?.(true), 0);
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

		const matchesQuery = (node: nodeTreeViewItem): boolean =>
			node.nodeName.toLowerCase().includes(query) || node.nodeType.toLowerCase().includes(query);

		const filteredTree = filterNodeTree(this.fullTree, matchesQuery);
		const matchCount = flattenNodeTree(filteredTree).filter(matchesQuery).length;

		model.setProperty('/treeSearchMatchCount', matchCount);
		treeModel.setData(filteredTree);
		this.expandAllTreeNodes('versionDetailTree');
	}

	protected getAiChatContext(): AiChatContext | null {
		const model = this.getModel('versionDetail') as JSONModel;
		const xml = (model.getProperty('/selectedDetailXml') as string) ?? '';
		if (!xml) {
			return null;
		}

		const detail = model.getProperty('/selectedDetail') as registryDetail | null;
		return {
			label: detail?.serviceDefId || 'Version metadata XML',
			xml,
			storageKey: detail ? `detail.${detail.detailId}` : undefined
		};
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

	public onDownloadXml(): void {
		const model = this.getModel('versionDetail') as JSONModel;
		const xml = model.getProperty('/selectedDetailXml') as string;
		if (!xml) {
			MessageToast.show('No XML content to download.');
			return;
		}

		const detail = model.getProperty('/selectedDetail') as registryDetail | null;
		const baseName = (detail?.serviceDefId || detail?.detailId || 'metadata').replace(/[^a-zA-Z0-9_.-]+/g, '_');
		this.downloadTextFile(`${baseName}.xml`, xml);
	}

	public onXmlLineSelectionChange(event: UI5Event): void {
		const source = event.getSource() as unknown as Table;
		const selectedItem = source.getSelectedItem();
		const context = selectedItem?.getBindingContext('versionDetail');
		const line = context?.getObject() as xmlLineEntry | undefined;
		if (!line) {
			return;
		}

		const model = this.getModel('versionDetail') as JSONModel;
		model.setProperty('/selectedNodeLine', line.lineNo);
	}

	// ─── Send Mail ───────────────────────────────────────────────────────────

	public onSendMail(): void {
		const model = this.getModel('versionDetail') as JSONModel;
		const detail = model.getProperty('/selectedDetail') as registryDetail | null;
		const defaultSubject = detail?.serviceDefId
			? `Version XML: ${detail.serviceDefId}`
			: 'Version XML Report';

		this.setModel(
			new JSONModel({
				busy: false,
				recipients: '',
				subject: defaultSubject,
				recipientsState: 'None',
				recipientsStateText: '',
				subjectState: 'None',
				subjectStateText: ''
			}),
			'sendMail'
		);

		const loadDialog = async () => {
			if (!this._sendMailDialog) {
				this._sendMailDialog = await Fragment.load({
					id: this.getView()?.getId(),
					name: 'com.zgp9.fe.view.fragments.SendVersionMailDialog',
					controller: this
				}) as Dialog;
				this.getView()?.addDependent(this._sendMailDialog);
			}
			this._sendMailDialog.open();
		};
		void loadDialog();
	}

	public onRecipientsLiveChange(): void {
		const model = this.getModel('sendMail') as JSONModel;
		const val = ((model.getProperty('/recipients') as string) ?? '').trim();
		if (val) {
			const { valid, invalid } = this.validateEmails(val);
			if (invalid.length > 0) {
				model.setProperty('/recipientsState', 'Warning');
				model.setProperty('/recipientsStateText', `Invalid: ${invalid.join(', ')}`);
			} else {
				model.setProperty('/recipientsState', 'Success');
				model.setProperty('/recipientsStateText', `${valid.length} recipient(s) valid`);
			}
		} else {
			model.setProperty('/recipientsState', 'None');
			model.setProperty('/recipientsStateText', '');
		}
	}

	public async onConfirmSendMail(): Promise<void> {
		const sendMailModel = this.getModel('sendMail') as JSONModel;
		const recipients = ((sendMailModel.getProperty('/recipients') as string) ?? '').trim();
		const subject = ((sendMailModel.getProperty('/subject') as string) ?? '').trim();

		let hasError = false;

		if (!recipients) {
			sendMailModel.setProperty('/recipientsState', 'Error');
			sendMailModel.setProperty('/recipientsStateText', 'Recipients is required.');
			hasError = true;
		} else {
			const { invalid } = this.validateEmails(recipients);
			if (invalid.length > 0) {
				sendMailModel.setProperty('/recipientsState', 'Error');
				sendMailModel.setProperty('/recipientsStateText', `Invalid email address(es): ${invalid.join(', ')}`);
				hasError = true;
			}
		}

		if (!subject) {
			sendMailModel.setProperty('/subjectState', 'Error');
			sendMailModel.setProperty('/subjectStateText', 'Subject is required.');
			hasError = true;
		} else {
			sendMailModel.setProperty('/subjectState', 'None');
			sendMailModel.setProperty('/subjectStateText', '');
		}

		if (hasError) return;


		const model = this.getModel('versionDetail') as JSONModel;
		const prettyXml = (model.getProperty('/selectedDetailXml') as string) ?? '';
		const detail = model.getProperty('/selectedDetail') as registryDetail | null;

		if (!prettyXml) {
			MessageBox.error('XML data is not loaded yet. Please wait and try again.');
			return;
		}

		const htmlContent = this.buildVersionHtml(prettyXml, subject, detail);
		const htmlSizeKb = Math.round(htmlContent.length / 1024);
		console.log(`[SendVersionMail] HTML size: ${htmlSizeKb} KB, recipients: "${recipients}"`);

		sendMailModel.setProperty('/busy', true);
		BusyIndicator.show(0);
		try {
			await this.getOwnerComponent().getDetailService().sendEmail({
				htmlContent,
				recipients,
				subject
			});
			this._sendMailDialog?.close();
			MessageBox.success('Email sent successfully.');
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			sendMailModel.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	public onCancelSendMail(): void {
		this._sendMailDialog?.close();
	}

	private validateEmails(raw: string): { valid: string[]; invalid: string[] } {
		const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const list = raw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
		const valid: string[] = [];
		const invalid: string[] = [];
		for (const addr of list) {
			(EMAIL_RE.test(addr) ? valid : invalid).push(addr);
		}
		return { valid, invalid };
	}

	private highlightForEmail(line: string): string {
		const indent = /^( +)/.exec(line)?.[1] ?? '';
		const indentHtml = indent.replace(/ /g, '&nbsp;');
		let html = indentHtml + highlightXmlLine(line.slice(indent.length));
		html = html
			.replace(/class="xmlTokPunct"/g, 'style="color:#00C"')
			.replace(/class="xmlTokTag"/g, 'style="color:#00008B"')
			.replace(/class="xmlTokAttr"/g, 'style="color:#7D0045"')
			.replace(/class="xmlTokVal"/g, 'style="color:#006400"')
			.replace(/class="xmlTokCmt"/g, 'style="color:#6a9955"');
		return html;
	}

	private buildVersionHtml(prettyXml: string, title: string, detail: registryDetail | null): string {
		const escHtml = (s: string) =>
			s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

		const lines = prettyXml.split('\n');

		const metaRows = detail
			? `<tr><td>Service Definition</td><td>${escHtml(detail.serviceDefId || '-')}</td></tr>` +
			`<tr><td>Version Id</td><td>${escHtml(detail.versionId || '-')}</td></tr>` +
			`<tr><td>Service Hash</td><td>${escHtml(detail.serviceHash || '-')}</td></tr>`
			: '';

		const S_NUM = 'style="padding:2px 4px;border:1px solid #eee;color:#aaa;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:4%"';
		const S_XML = 'style="padding:2px 8px;border:1px solid #eee;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top"';
		const TH = 'style="padding:4px 6px;border:1px solid #ddd;background:#f5f5f5;text-align:left;font-family:sans-serif;font-size:11px"';

		const styledRows = lines.map((line, idx) =>
			`<tr><td ${S_NUM}>${idx + 1}</td><td ${S_XML}>${this.highlightForEmail(line)}</td></tr>`
		).join('');

		const metaStyle = 'style="padding:2px 12px 2px 0;font-family:sans-serif;font-size:12px"';
		const metaLabelStyle = 'style="padding:2px 12px 2px 0;font-family:sans-serif;font-size:12px;color:#666;white-space:nowrap"';

		const metaTable = metaRows
			? `<table style="border-collapse:collapse;margin-bottom:16px"><tbody>` +
			metaRows.replace(/<td>/g, `<td ${metaStyle}>`).replace(/<td class="[^"]*">/g, `<td ${metaLabelStyle}>`) +
			`</tbody></table>`
			: '';

		return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:8px;font-family:sans-serif;color:#333">` +
			`<h2 style="margin-bottom:4px">${escHtml(title)}</h2>` +
			metaTable +
			`<table style="border-collapse:collapse;width:100%;table-layout:fixed">` +
			`<colgroup><col style="width:4%"/><col style="width:96%"/></colgroup>` +
			`<thead><tr><th ${TH}>#</th><th ${TH}>XML Content</th></tr></thead>` +
			`<tbody>${styledRows}</tbody>` +
			`</table></body></html>`;
	}

	// ─────────────────────────────────────────────────────────────────────────

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
				const detailToLoad = queryDetailId ? details.find(d => d.detailId === queryDetailId) || details[0] : details[0];
				await this.loadDetailWorkspace(detailToLoad);
			}
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}

	private async loadDetailWorkspace(detail: registryDetail): Promise<void> {
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
				this.getOwnerComponent().getDetailService().getDetail(detail.detailId),
				this.getOwnerComponent().getDetailService().getParsedDetail(detail.detailId),
				this.getOwnerComponent().getDetailService().getNodeTree(detail.detailId)
			]);
			let rawXml = parsedDetail.metadataXml || loadedDetail.metadataXml || '';
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
			this.expandTreeToLevel('versionDetailTree', 1);
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

	private expandTreeToLevel(treeId: string, level: number): void {
		const tree = this.byId(treeId) as Tree;
		if (!tree) {
			return;
		}

		tree.attachEventOnce('updateFinished', () => {
			if (typeof tree.expandToLevel === 'function') {
				tree.expandToLevel(level);
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

	private downloadTextFile(fileName: string, content: string): void {
		const blob = new Blob([content], { type: 'application/xml' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	private createFallbackNodeTree(detail: registryDetail): nodeTreeViewItem[] {
		return buildNodeTree([
			{
				nodeId: detail.detailId,
				semanticId: detail.serviceDefId || detail.detailId,
				parentId: '',
				nodePath: '1',
				nodeType: 'Detail',
				nodeName: detail.serviceDefId || 'Detail',
				nodeAlias: '',
				offsetStart: 0,
				offsetEnd: detail.metadataXml.length,
				seq: 1,
				depth: 0,
				attributes: []
			}
		]);
	}

	private applyLineNumbers(nodes: nodeTreeViewItem[], lineStarts: number[], xml: string): void {
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

	private buildXmlLines(xml: string): xmlLineEntry[] {
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
		table.getItems().forEach((item) => {
			item.removeStyleClass('versionDetailXmlHighlighted');
		});

		const item = table.getItems().find((listItem) => {
			const context = listItem.getBindingContext('versionDetail');
			return (context?.getObject() as xmlLineEntry | null)?.lineNo === lineNo;
		});
		if (item) {
			item.addStyleClass('versionDetailXmlHighlighted');
			item.getDomRef()?.scrollIntoView({ block: 'center', inline: 'nearest' });
			if (this.highlightClearTimer !== null) {
				window.clearTimeout(this.highlightClearTimer);
			}
			this.highlightClearTimer = window.setTimeout(() => {
				table.getItems().forEach((row) => row.removeStyleClass('versionDetailXmlHighlighted'));
				this.highlightClearTimer = null;
			}, 1400);
		}
	}
}
