import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';
import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';
import TreeTable from 'sap/ui/table/TreeTable';
import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageBox from 'sap/m/MessageBox';
import Fragment from 'sap/ui/core/Fragment';
import type Dialog from 'sap/m/Dialog';

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
import { applyNodeDiffStatus, buildLineHighlightMap, buildNodeTree, offsetToLine, prettyPrintXml } from '../services/XmlNodeUtils';

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
	private _sendMailDialogPromise: Promise<Dialog> | null = null;
	private _sendMailDialog: Dialog | null = null;

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
				compareNodeDiff: [],
				baseRawXml: '',
				compareRawXml: ''
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

	// ── Send Mail ────────────────────────────────────────────────────────────

	public onSendMail(): void {
		const detailModel = this.getModel('detailCompare') as JSONModel;
		const baseDetail = detailModel.getProperty('/baseDetail') as { serviceDefinition?: string } | null;
		const defaultSubject = baseDetail?.serviceDefinition
			? `XML Comparison: ${baseDetail.serviceDefinition}`
			: 'XML Comparison Report';

		this.setModel(
			new JSONModel({
				busy: false,
				recipients: '',
				subject: defaultSubject
			}),
			'sendMail'
		);

		if (this._sendMailDialogPromise === null) {
			this._sendMailDialogPromise = Fragment.load({
			id: this.getView().getId(),
			name: 'com.zgp9.fe.view.fragments.SendMailDialog',
			controller: this
		}) as Promise<Dialog>;
	}

	void this._sendMailDialogPromise.then((dialog) => {
		this._sendMailDialog = dialog;
		if (!dialog.getParent()) {
			this.getView().addDependent(dialog);
			}
			dialog.open();
		});
	}

	public async onConfirmSendMail(): Promise<void> {
		const sendMailModel = this.getModel('sendMail') as JSONModel;
		const recipients = ((sendMailModel.getProperty('/recipients') as string) ?? '').trim();
		const subject = ((sendMailModel.getProperty('/subject') as string) ?? '').trim() || 'XML Comparison Report';

		if (!recipients) {
			MessageBox.error('Please enter at least one recipient email address.');
			return;
		}

		const detailModel = this.getModel('detailCompare') as JSONModel;
		const basePrettyXml = (detailModel.getProperty('/basePrettyXml') as string) ?? '';
		const comparePrettyXml = (detailModel.getProperty('/comparePrettyXml') as string) ?? '';

		if (!basePrettyXml || !comparePrettyXml) {
			MessageBox.error('XML data is not loaded yet. Please wait and try again.');
			return;
		}

		const htmlContent = this.buildCompareHtml(basePrettyXml, comparePrettyXml, subject);
		const htmlSizeKb = Math.round(htmlContent.length / 1024);
		console.log(`[SendMail] HTML size: ${htmlSizeKb} KB, recipients: "${recipients}", subject: "${subject}"`);

		sendMailModel.setProperty('/busy', true);
		BusyIndicator.show(0);
		try {
			const result = await this.getOwnerComponent().getDetailService().sendEmail({
				htmlContent,
				recipients,
				subject
			});

			this._sendMailDialog?.close();

			if (result.success) {
				MessageBox.success(result.message || 'Email sent successfully to ' + recipients + '.');
			} else {
				const detail = result.failedRecip ? `\nFailed recipients: ${result.failedRecip}` : '';
				MessageBox.warning((result.message || 'Email may not have been delivered.') + detail);
			}
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

	public onRecipientInputChange(): void {
		// intentionally empty – triggers two-way binding refresh
	}

	private buildCompareHtml(baseXml: string, compareXml: string, title: string): string {
		const escHtml = (s: string): string =>
			s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

		const baseLines = baseXml.split('\n');
		const compareLines = compareXml.split('\n');
		const maxLen = Math.max(baseLines.length, compareLines.length);

		let rows = '';
		for (let i = 0; i < maxLen; i++) {
			const left  = baseLines[i] ?? '';
			const right = compareLines[i] ?? '';
			const isDiff = left !== right;

			let leftHtml: string;
			let rightHtml: string;
			if (isDiff) {
				[leftHtml, rightHtml] = this.inlineDiffHtml(left, right);
			} else {
				leftHtml = escHtml(left);
				rightHtml = escHtml(right);
			}

			const rowCls = isDiff ? ' class="d"' : '';
			rows += `<tr${rowCls}>` +
				`<td class="n">${i + 1}</td>` +
				`<td class="x">${leftHtml}</td>` +
				`<td class="n">${i + 1}</td>` +
				`<td class="x">${rightHtml}</td>` +
				`</tr>`;
		}

		const css =
			`body{margin:8px;font-family:sans-serif}` +
			`h2{color:#333}` +
			`table{border-collapse:collapse;width:100%;table-layout:fixed}` +
			`th{padding:4px;border:1px solid #ddd;background:#f5f5f5;text-align:left}` +
			`td.n{padding:2px 4px;border:1px solid #ddd;color:#999;text-align:right;` +
				`font-family:monospace;font-size:11px;white-space:nowrap;width:3%;user-select:none}` +
			`td.x{padding:2px 6px;border:1px solid #ddd;white-space:pre-wrap;` +
				`overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%}` +
			`tr.d td.x{background:#fffbe6}` +
			`tr.d td:nth-child(1){background:#ffd7d5;color:#c00}` +
			`tr.d td:nth-child(3){background:#ccffd8;color:#080}` +
			`mark.del{background:#ffd7d5;color:inherit;border-radius:2px;padding:0 1px}` +
			`mark.ins{background:#ccffd8;color:inherit;border-radius:2px;padding:0 1px}`;

		return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>` +
			`<h2>${escHtml(title)}</h2>` +
			`<table>` +
				`<colgroup><col style="width:3%"/><col style="width:47%"/><col style="width:3%"/><col style="width:47%"/></colgroup>` +
				`<thead><tr><th>#</th><th>Base XML</th><th>#</th><th>Compare XML</th></tr></thead>` +
				`<tbody>${rows}</tbody>` +
			`</table></body></html>`;
	}

	/**
	 * Tính inline word-level diff giữa 2 dòng.
	 * Trả về [baseHtml, compareHtml] với <mark class="del"> / <mark class="ins"> trên phần thay đổi.
	 */
	private inlineDiffHtml(base: string, compare: string): [string, string] {
		const esc = (s: string) =>
			s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

		// Tách thành tokens: chuỗi ký tự liên tiếp không phải space, và khoảng trắng
		const tokenize = (s: string): string[] => s.match(/\S+|\s+/g) ?? (s ? [s] : []);

		const bTok = tokenize(base);
		const cTok = tokenize(compare);
		const m = bTok.length;
		const n = cTok.length;

		// LCS DP
		const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				dp[i][j] = bTok[i - 1] === cTok[j - 1]
					? dp[i - 1][j - 1] + 1
					: Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}

		// Backtrack để lấy danh sách thao tác
		type Op = { op: 'same' | 'del' | 'ins'; val: string };
		const ops: Op[] = [];
		let i = m, j = n;
		while (i > 0 || j > 0) {
			if (i > 0 && j > 0 && bTok[i - 1] === cTok[j - 1]) {
				ops.unshift({ op: 'same', val: bTok[i - 1] });
				i--; j--;
			} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
				ops.unshift({ op: 'ins', val: cTok[j - 1] });
				j--;
			} else {
				ops.unshift({ op: 'del', val: bTok[i - 1] });
				i--;
			}
		}

		let baseHtml = '';
		let cmpHtml = '';
		for (const { op, val } of ops) {
			const escaped = esc(val);
			if (op === 'same') {
				baseHtml += escaped;
				cmpHtml  += escaped;
			} else if (op === 'del') {
				baseHtml += `<mark class="del">${escaped}</mark>`;
			} else {
				cmpHtml  += `<mark class="ins">${escaped}</mark>`;
			}
		}

		return [baseHtml, cmpHtml];
	}

	// ─────────────────────────────────────────────────────────────────────────

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

			let baseXmlLines = this.buildXmlLines(baseXml);
			let compareXmlLines = this.buildXmlLines(compareXml);

		model.setProperty('/baseRawXml', baseRawXml);
		model.setProperty('/compareRawXml', compareRawXml);
		model.setProperty('/basePrettyXml', baseXml);
		model.setProperty('/comparePrettyXml', compareXml);
			model.setProperty('/baseDetail', baseDetail);
			model.setProperty('/compareDetail', compareDetail);
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

				const baseLineHighlights = buildLineHighlightMap(baseTree);
				const compareLineHighlights = buildLineHighlightMap(compareTreeMapped);
				baseXmlLines = this.applyLineHighlights(baseXmlLines, baseLineHighlights);
				compareXmlLines = this.applyLineHighlights(compareXmlLines, compareLineHighlights);

				model.setProperty('/baseTree', baseTree);
				model.setProperty('/compareTree', compareTreeMapped);

				this.scheduleTreeExpansion('baseTree');
				this.scheduleTreeExpansion('compareTree');
			}

			model.setProperty('/baseXmlLines', baseXmlLines);
			model.setProperty('/compareXmlLines', compareXmlLines);
			model.refresh(true);
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

	private findScrollElement(controlId: string, _treeMode: boolean): HTMLElement | null {
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
			isWhitespace: text.trim().length === 0,
			highlight: 'None'
		}));
	}

	private applyLineHighlights(lines: XmlLineEntry[], lineHighlights: Map<number, string>): XmlLineEntry[] {
		return lines.map((line) => ({
			...line,
			highlight: lineHighlights.get(line.lineNo) ?? 'None'
		}));
	}

	private getLineStarts(path: string): number[] {
		const model = this.getModel('detailCompare') as JSONModel;
		return (model.getProperty(path) as number[]) ?? [];
	}
}
