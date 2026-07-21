import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';
import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';
import TreeTable from 'sap/ui/table/TreeTable';
import type UI5Event from 'sap/ui/base/Event';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import JSONModel from 'sap/ui/model/json/JSONModel';
import MessageBox from 'sap/m/MessageBox';
import MessageToast from 'sap/m/MessageToast';
import Fragment from 'sap/ui/core/Fragment';
import type Dialog from 'sap/m/Dialog';
import type Table from 'sap/m/Table';

import BaseController, { type AiChatContext } from './BaseController';
interface ExtendedTreeBinding {
	expand(index: number): void;
	getLength(): number;
	getContextByIndex(index: number): { getObject: () => NodeTreeViewItem } | undefined;
	isExpanded(index: number): boolean;
	getMetadata?(): { getName(): string };
}

import type { NodeTreeViewItem, RegistryDetail, XmlLineEntry } from '../model/types';
import { applyNodeDiffStatus, buildLineHighlightMap, buildNodeTree, computeLineDiff, highlightXmlLine, normalizeXmlLine, offsetToLine, prettyPrintXml } from '../services/XmlNodeUtils';

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
	/** Aligned-row indices at which each change block starts (for prev/next navigation). */
	private changeBlockStarts: number[] = [];
	private changeBlockCursor = -1;
	/** Full aligned line arrays kept so the "Changes only" filter can toggle without reloading. */
	private baseXmlLinesAll: XmlLineEntry[] = [];
	private compareXmlLinesAll: XmlLineEntry[] = [];
	/** Rows of unchanged context kept around each change in "Changes only" mode. */
	private static readonly CHANGES_CONTEXT = 3;
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
				compareRawXml: '',
				diffAdded: 0,
				diffRemoved: 0,
				diffChanged: 0,
				changeBlockCount: 0,
				navPosition: '',
				xmlViewMode: 'all'
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

	protected getAiChatContext(): AiChatContext | null {
		const model = this.getModel('detailCompare') as JSONModel;
		const baseXml = (model.getProperty('/basePrettyXml') as string) ?? '';
		const compareXml = (model.getProperty('/comparePrettyXml') as string) ?? '';
		if (!baseXml && !compareXml) {
			return null;
		}

		// Split the context budget between both sides so neither one gets cut off entirely.
		const halfBudget = 18000;
		const clip = (xml: string): string =>
			xml.length > halfBudget ? xml.slice(0, halfBudget) + '\n<!-- ... truncated ... -->' : xml;

		const baseDetail = model.getProperty('/baseDetail') as { serviceDefinition?: string } | null;
		return {
			label: `Comparison of two versions of ${baseDetail?.serviceDefinition || 'a service'} (BASE vs COMPARE)`,
			xml: `<!-- BASE XML -->\n${clip(baseXml)}\n\n<!-- COMPARE XML -->\n${clip(compareXml)}`,
			suggestions: ['Explain the differences', 'Any breaking changes?', 'Which entities were added or removed?'],
			storageKey: this.baseDetailId && this.compareDetailId ? `compare.${this.baseDetailId}_${this.compareDetailId}` : undefined
		};
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
				subject: defaultSubject,
				emailMode: 'diff',
				recipientsState: 'None',
				recipientsStateText: '',
				subjectState: 'None',
				subjectStateText: ''
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
		const subject    = ((sendMailModel.getProperty('/subject') as string) ?? '').trim();

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

		const detailModel = this.getModel('detailCompare') as JSONModel;
		const basePrettyXml = (detailModel.getProperty('/basePrettyXml') as string) ?? '';
		const comparePrettyXml = (detailModel.getProperty('/comparePrettyXml') as string) ?? '';

		if (!basePrettyXml || !comparePrettyXml) {
			MessageBox.error('XML data is not loaded yet. Please wait and try again.');
			return;
		}

		let emailMode: 'full' | 'diff' = (sendMailModel.getProperty('/emailMode') as string) === 'full' ? 'full' : 'diff';
		let htmlContent = this.buildCompareHtml(basePrettyXml, comparePrettyXml, subject, emailMode);
		let htmlSizeKb = Math.round(htmlContent.length / 1024);
		console.log(`[SendMail] mode: ${emailMode}, HTML size: ${htmlSizeKb} KB, recipients: "${recipients}"`);

		// Nếu Full XML vẫn > 500 KB sau khi tối ưu CSS → hỏi user thay vì auto-switch
		if (emailMode === 'full' && htmlSizeKb > 500) {
			const diffContent = this.buildCompareHtml(basePrettyXml, comparePrettyXml, subject, 'diff');
			const diffKb = Math.round(diffContent.length / 1024);
			const choice = await new Promise<'diff' | 'full' | 'cancel'>((resolve) => {
				MessageBox.warning(
					`Full XML is ${htmlSizeKb} KB which may exceed the backend limit.\n\n` +
					`• Send as Diff Only (${diffKb} KB) — recommended\n` +
					`• Try sending Full XML anyway (may fail)\n` +
					`• Cancel`,
					{
						actions: ['Send Diff Only', 'Try Full Anyway', MessageBox.Action.CANCEL],
						emphasizedAction: 'Send Diff Only',
						onClose: (action: string) => {
							if (action === 'Send Diff Only') resolve('diff');
							else if (action === 'Try Full Anyway') resolve('full');
							else resolve('cancel');
						}
					}
				);
			});

			if (choice === 'cancel') return;
			if (choice === 'diff') {
				htmlContent = diffContent;
				htmlSizeKb = diffKb;
				emailMode = 'diff';
			}
			// 'full': giữ nguyên, thử gửi và để backend trả lỗi nếu có
		}

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

	/** Tách và validate danh sách email (phân cách bởi ; hoặc ,) */
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

	/**
	 * Highlight XML + preserve indentation (space → &nbsp;) + inline styles thay CSS class
	 * để màu sắc không bị mất khi Gmail cắt email và strip <style> block.
	 */
	private highlightForEmail(line: string): string {
		const indent = /^( +)/.exec(line)?.[1] ?? '';
		const indentHtml = indent.replace(/ /g, '&nbsp;');
		let html = indentHtml + highlightXmlLine(line.slice(indent.length));
		// Inline styles thay class → Gmail safe
		html = html
			.replace(/class="xmlTokPunct"/g, 'style="color:#00C"')
			.replace(/class="xmlTokTag"/g,   'style="color:#00008B"')
			.replace(/class="xmlTokAttr"/g,  'style="color:#7D0045"')
			.replace(/class="xmlTokVal"/g,   'style="color:#006400"')
			.replace(/class="xmlTokCmt"/g,   'style="color:#6a9955"');
		return html;
	}

	private buildCompareHtml(baseXml: string, compareXml: string, title: string, mode: 'diff' | 'full' = 'diff'): string {
		const escHtml = (s: string): string =>
			s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

		// Full mode dùng CSS <style> block → mỗi cell chỉ cần class="n"/"x"/...
		// thay vì inline style dài ~130 chars → giảm ~250 KB cho file lớn.
		// Diff mode vẫn dùng inline style để tương thích Gmail (style block bị strip khi truncate).
		const useClasses = mode === 'full';

		// Full mode: chỉ dùng CSS class cho SAME rows (không cần màu diff).
		// Del/ins/change rows luôn dùng inline style để màu diff hiện dù email client
		// strip <style> block (Gmail, v.v.).
		// Same rows chiếm ~80-90% tổng dòng → tiết kiệm ~200 KB.
		const cssBlock = useClasses ? `<style>
td.n{padding:2px 4px;border:1px solid #ddd;color:#999;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%}
td.x{padding:2px 6px;border:1px solid #ddd;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%}
span.xt{color:#00008B}span.xa{color:#7D0045}span.xv{color:#006400}span.xp{color:#00C}span.xc{color:#6a9955}
</style>` : '';

		// Same rows: CSS class (full) hoặc inline style (diff)
		const S_N    = useClasses ? 'class="n"' : 'style="padding:2px 4px;border:1px solid #ddd;color:#999;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%"';
		const S_X    = useClasses ? 'class="x"' : 'style="padding:2px 6px;border:1px solid #ddd;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%"';
		// Del/ins/change rows: LUÔN inline style để màu diff không phụ thuộc <style> block
		const S_N_D  = 'style="padding:2px 4px;border:1px solid #ffd7d5;background:#ffd7d5;color:#c00;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%"';
		const S_N_I  = 'style="padding:2px 4px;border:1px solid #ccffd8;background:#ccffd8;color:#080;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%"';
		const S_N_E  = 'style="padding:2px 4px;border:1px solid #eee;background:#f8f8f8;width:3%"';
		const S_X_D  = 'style="padding:2px 6px;border:1px solid #ffd7d5;background:#ffd7d5;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%"';
		const S_X_I  = 'style="padding:2px 6px;border:1px solid #ccffd8;background:#ccffd8;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%"';
		const S_X_E  = 'style="padding:2px 6px;border:1px solid #eee;background:#f8f8f8;width:47%"';
		const SEP    = 'style="padding:3px 8px;text-align:center;color:#888;background:#f5f5f5;font-family:sans-serif;font-size:11px;border:1px solid #ddd"';

		// ── Build aligned rows với LCS line diff ──────────────────────────────
		interface AlignedRow { op: 'same' | 'del' | 'ins' | 'change'; bNo: number; cNo: number; bLine: string; cLine: string; }

		// Normalize attributes trước khi so sánh LCS; original lines dùng cho display
		const ops = computeLineDiff(baseXml.split('\n'), compareXml.split('\n'), normalizeXmlLine);

		// Tính độ tương đồng giữa 2 dòng dựa trên số token chung / tổng token
		// Dùng normalized key để similarity không bị ảnh hưởng bởi thứ tự attribute
		const lineSimilarity = (a: string, b: string): number => {
			const ka = normalizeXmlLine(a);
			const kb = normalizeXmlLine(b);
			if (ka === kb) return 1;
			const tokenize = (s: string) => new Set(s.trim().match(/\S+/g) ?? []);
			const sa = tokenize(ka), sb = tokenize(kb);
			if (sa.size === 0 && sb.size === 0) return 1;
			if (sa.size === 0 || sb.size === 0) return 0;
			let common = 0;
			sa.forEach(t => { if (sb.has(t)) common++; });
			return (2 * common) / (sa.size + sb.size);
		};

		// Post-process: chỉ merge adjacent (del, ins) → change khi 2 dòng đủ giống nhau (≥50%).
		// Nếu khác hoàn toàn thì giữ nguyên del/ins riêng để tránh ghép sai.
		const merged: Array<{ op: 'same' | 'del' | 'ins' | 'change'; bLine: string; cLine: string }> = [];
		let k = 0;
		while (k < ops.length) {
			const cur = ops[k];
			const next = k + 1 < ops.length ? ops[k + 1] : undefined;
			if (cur.op === 'del' && next !== undefined && next.op === 'ins'
					&& lineSimilarity(cur.line, next.line) >= 0.5) {
				merged.push({ op: 'change', bLine: cur.line, cLine: next.line });
				k += 2;
			} else if (cur.op === 'del') {
				merged.push({ op: 'del', bLine: cur.line, cLine: '' });
				k++;
			} else if (cur.op === 'ins') {
				merged.push({ op: 'ins', bLine: '', cLine: cur.line });
				k++;
			} else {
				// same: mỗi bên giữ original text của chính mình
				merged.push({ op: 'same', bLine: cur.baseLine, cLine: cur.compareLine });
				k++;
			}
		}

		const alignedRows: AlignedRow[] = [];
		let bNo = 1, cNo = 1;
		for (const m of merged) {
			if (m.op === 'same') {
				alignedRows.push({ op: 'same', bNo: bNo++, cNo: cNo++, bLine: m.bLine, cLine: m.cLine });
			} else if (m.op === 'del') {
				alignedRows.push({ op: 'del', bNo: bNo++, cNo: 0, bLine: m.bLine, cLine: '' });
			} else if (m.op === 'ins') {
				alignedRows.push({ op: 'ins', bNo: 0, cNo: cNo++, bLine: '', cLine: m.cLine });
			} else {
				alignedRows.push({ op: 'change', bNo: bNo++, cNo: cNo++, bLine: m.bLine, cLine: m.cLine });
			}
		}

		// Full mode: syntax token spans dùng class thay style (tiết kiệm thêm ~30-40KB)
		const hlEmail = (line: string) => {
			const h = this.highlightForEmail(line);
			if (!useClasses) return h;
			return h
				.replace(/style="color:#00C"/g,    'class="xp"')
				.replace(/style="color:#00008B"/g,  'class="xt"')
				.replace(/style="color:#7D0045"/g,  'class="xa"')
				.replace(/style="color:#006400"/g,  'class="xv"')
				.replace(/style="color:#6a9955"/g,  'class="xc"');
		};

		const renderRow = (row: AlignedRow): string => {
			if (row.op === 'same') {
				const hb = hlEmail(row.bLine);
				const hc = hlEmail(row.cLine);
				return `<tr><td ${S_N}>${row.bNo}</td><td ${S_X}>${hb}</td><td ${S_N}>${row.cNo}</td><td ${S_X}>${hc}</td></tr>`;
			}
			if (row.op === 'del') {
				const h = hlEmail(row.bLine);
				return `<tr><td ${S_N_D}>${row.bNo}</td><td ${S_X_D}>${h}</td><td ${S_N_E}>&nbsp;</td><td ${S_X_E}>&nbsp;</td></tr>`;
			}
			if (row.op === 'ins') {
				const h = hlEmail(row.cLine);
				return `<tr><td ${S_N_E}>&nbsp;</td><td ${S_X_E}>&nbsp;</td><td ${S_N_I}>${row.cNo}</td><td ${S_X_I}>${h}</td></tr>`;
			}
			// change: inline word-level diff
			const [bHtml, cHtml] = this.inlineDiffHtml(row.bLine, row.cLine);
			return `<tr><td ${S_N_D}>${row.bNo}</td><td ${S_X_D}>${bHtml}</td><td ${S_N_I}>${row.cNo}</td><td ${S_X_I}>${cHtml}</td></tr>`;
		};

		let rows = '';
		let changedCount = 0;
		alignedRows.forEach(r => { if (r.op !== 'same') changedCount++; });

		if (mode === 'full') {
			for (const row of alignedRows) rows += renderRow(row);
		} else {
			// Diff mode: changed rows + 3 dòng context
			const CONTEXT = 3;
			const changedIdx = new Set<number>();
			alignedRows.forEach((r, i) => { if (r.op !== 'same') changedIdx.add(i); });

			if (changedIdx.size === 0) {
				rows = `<tr><td colspan="4" ${SEP}>No differences found.</td></tr>`;
			} else {
				const included = new Set<number>();
				for (const idx of changedIdx) {
					for (let x = Math.max(0, idx - CONTEXT); x <= Math.min(alignedRows.length - 1, idx + CONTEXT); x++) {
						included.add(x);
					}
				}
				const sorted = [...included].sort((a, b) => a - b);
				let prevIdx = -2;
				for (const idx of sorted) {
					if (prevIdx >= 0 && idx > prevIdx + 1) {
						rows += `<tr><td colspan="4" ${SEP}>··· ${idx - prevIdx - 1} unchanged line(s) ···</td></tr>`;
					}
					rows += renderRow(alignedRows[idx]);
					prevIdx = idx;
				}
			}
		}

		const totalBase = bNo - 1, totalCmp = cNo - 1;
		const modeLabel = mode === 'full'
			? `Full XML — Base: ${totalBase} lines, Compare: ${totalCmp} lines`
			: `Diff only — ${changedCount} changed section(s) with 3-line context`;
		const summary = `<p style="font-family:sans-serif;font-size:12px;color:#555;margin:4px 0 12px"><b>${modeLabel}</b></p>`;
		const TH = 'style="padding:4px 6px;border:1px solid #ddd;background:#f5f5f5;text-align:left;font-family:sans-serif;font-size:12px"';

		return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${cssBlock}</head><body style="margin:8px;font-family:sans-serif">` +
			`<h2 style="color:#333;margin-bottom:4px">${escHtml(title)}</h2>` +
			summary +
			`<table style="border-collapse:collapse;width:100%;table-layout:fixed">` +
			`<colgroup><col style="width:3%"/><col style="width:47%"/><col style="width:3%"/><col style="width:47%"/></colgroup>` +
			`<thead><tr><th ${TH}>#</th><th ${TH}>Base XML</th><th ${TH}>#</th><th ${TH}>Compare XML</th></tr></thead>` +
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
				baseHtml += `<mark style="background:#ffd7d5;color:inherit">${escaped}</mark>`;
			} else {
				cmpHtml  += `<mark style="background:#ccffd8;color:inherit">${escaped}</mark>`;
			}
		}

		return [baseHtml, cmpHtml];
	}

	// ─────────────────────────────────────────────────────────────────────────

	public onCopyBaseXml(): void {
		const xml = (this.getModel('detailCompare') as JSONModel).getProperty('/basePrettyXml') as string;
		void navigator.clipboard
			.writeText(xml)
			.then(() => MessageToast.show('Base XML copied.'))
			.catch(() => MessageToast.show('Failed to copy XML.'));
	}

	public onCopyCompareXml(): void {
		const xml = (this.getModel('detailCompare') as JSONModel).getProperty('/comparePrettyXml') as string;
		void navigator.clipboard
			.writeText(xml)
			.then(() => MessageToast.show('Compare XML copied.'))
			.catch(() => MessageToast.show('Failed to copy XML.'));
	}

	public onNavBack(): void {
		if (this.registryId && this.leftVersionId && this.rightVersionId) {
			this.navTo('versionCompare', {
				registryId: this.registryId,
				leftVersionId: this.leftVersionId,
				rightVersionId: this.rightVersionId
			}, true);
		} else if (this.registryId) {
			this.navTo('registryDetail', { registryId: this.registryId }, true);
		} else {
			this.navTo('registryList', {}, true);
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

		const aligned = this.buildAlignedXmlLines(baseXml, compareXml);
		let baseXmlLines = aligned.base;
		let compareXmlLines = aligned.compare;

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

			this.baseXmlLinesAll = baseXmlLines;
			this.compareXmlLinesAll = compareXmlLines;
			this.computeDiffTotals(baseXmlLines, compareXmlLines);
			model.setProperty('/xmlViewMode', 'all');
			this.applyXmlViewMode('all');
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

	// ── Change navigation (prev/next across the aligned XML panes) ────────────

	/** Set the added/removed/changed totals from the full aligned diff (mode-independent). */
	private computeDiffTotals(baseLines: XmlLineEntry[], compareLines: XmlLineEntry[]): void {
		const model = this.getModel('detailCompare') as JSONModel;
		let added = 0;
		let removed = 0;
		let changed = 0;

		const rowCount = Math.max(baseLines.length, compareLines.length);
		for (let i = 0; i < rowCount; i++) {
			const b = baseLines[i]?.lineType ?? 'same';
			const c = compareLines[i]?.lineType ?? 'same';

			if (b === 'del' && c === 'ins') {
				changed++;
			} else if (b === 'del') {
				removed++;
			} else if (c === 'ins') {
				added++;
			}
		}

		model.setProperty('/diffAdded', added);
		model.setProperty('/diffRemoved', removed);
		model.setProperty('/diffChanged', changed);
	}

	/**
	 * Recompute the ordered list of change-block start rows against the CURRENTLY
	 * displayed rows (which differ between "All lines" and "Changes only"), so
	 * prev/next navigation lands on the right item in either mode. A change block
	 * is a maximal run of rows where either side is not a 'same' line.
	 */
	private indexChangeBlocks(baseLines: XmlLineEntry[], compareLines: XmlLineEntry[]): void {
		const model = this.getModel('detailCompare') as JSONModel;
		const blockStarts: number[] = [];
		let inBlock = false;

		const rowCount = Math.max(baseLines.length, compareLines.length);
		for (let i = 0; i < rowCount; i++) {
			const b = baseLines[i]?.lineType ?? 'same';
			const c = compareLines[i]?.lineType ?? 'same';
			// Test for an actual del/ins on either side so the collapsed-gap
			// separators (blank on both sides) are not counted as changes.
			const isChangeRow = b === 'del' || b === 'ins' || c === 'del' || c === 'ins';
			if (isChangeRow) {
				if (!inBlock) {
					blockStarts.push(i);
					inBlock = true;
				}
			} else {
				inBlock = false;
			}
		}

		this.changeBlockStarts = blockStarts;
		this.changeBlockCursor = -1;
		model.setProperty('/changeBlockCount', blockStarts.length);
		model.setProperty('/navPosition', blockStarts.length > 0 ? `0 / ${blockStarts.length}` : '');
	}

	public onXmlViewModeChange(): void {
		const model = this.getModel('detailCompare') as JSONModel;
		const mode = (model.getProperty('/xmlViewMode') as string) === 'changes' ? 'changes' : 'all';
		this.applyXmlViewMode(mode);
	}

	/** Bind the XML panes to either the full aligned rows or the changes-only view. */
	private applyXmlViewMode(mode: 'all' | 'changes'): void {
		const model = this.getModel('detailCompare') as JSONModel;
		let base = this.baseXmlLinesAll;
		let compare = this.compareXmlLinesAll;

		if (mode === 'changes') {
			const filtered = this.buildChangesOnlyView(this.baseXmlLinesAll, this.compareXmlLinesAll);
			base = filtered.base;
			compare = filtered.compare;
		}

		model.setProperty('/baseXmlLines', base);
		model.setProperty('/compareXmlLines', compare);
		this.indexChangeBlocks(base, compare);
	}

	/**
	 * Keep only changed rows plus CHANGES_CONTEXT lines of surrounding context.
	 * Collapsed regions are replaced by a single dimmed "··· N unchanged ···"
	 * separator row. Both panes are filtered by the same index set so they stay
	 * aligned row-for-row (and the scroll-sync keeps working).
	 */
	private buildChangesOnlyView(baseAll: XmlLineEntry[], compareAll: XmlLineEntry[]): { base: XmlLineEntry[]; compare: XmlLineEntry[] } {
		const rowCount = Math.max(baseAll.length, compareAll.length);
		const changed = new Set<number>();
		for (let i = 0; i < rowCount; i++) {
			const b = baseAll[i]?.lineType ?? 'same';
			const c = compareAll[i]?.lineType ?? 'same';
			if (b !== 'same' || c !== 'same') {
				changed.add(i);
			}
		}

		const base: XmlLineEntry[] = [];
		const compare: XmlLineEntry[] = [];
		if (changed.size === 0) {
			return { base, compare };
		}

		const included = new Set<number>();
		for (const idx of changed) {
			const from = Math.max(0, idx - DetailCompare.CHANGES_CONTEXT);
			const to = Math.min(rowCount - 1, idx + DetailCompare.CHANGES_CONTEXT);
			for (let x = from; x <= to; x++) {
				included.add(x);
			}
		}

		const gapRow = (gap: number): XmlLineEntry => ({
			lineNo: 0,
			text: `··· ${gap} unchanged line(s) ···`,
			isWhitespace: false,
			highlight: 'None',
			lineType: 'empty'
		});

		const sorted = [...included].sort((a, b) => a - b);
		let prev = -1;
		for (const idx of sorted) {
			if (prev >= 0 && idx > prev + 1) {
				const gap = idx - prev - 1;
				base.push(gapRow(gap));
				compare.push(gapRow(gap));
			}
			base.push(baseAll[idx]);
			compare.push(compareAll[idx]);
			prev = idx;
		}

		return { base, compare };
	}

	public onNextChange(): void {
		if (this.changeBlockStarts.length === 0) {
			return;
		}
		this.changeBlockCursor = (this.changeBlockCursor + 1) % this.changeBlockStarts.length;
		this.goToChangeBlock();
	}

	public onPrevChange(): void {
		if (this.changeBlockStarts.length === 0) {
			return;
		}
		this.changeBlockCursor =
			(this.changeBlockCursor - 1 + this.changeBlockStarts.length) % this.changeBlockStarts.length;
		this.goToChangeBlock();
	}

	private goToChangeBlock(): void {
		const rowIndex = this.changeBlockStarts[this.changeBlockCursor];
		const model = this.getModel('detailCompare') as JSONModel;
		model.setProperty('/navPosition', `${this.changeBlockCursor + 1} / ${this.changeBlockStarts.length}`);

		const baseTable = this.byId('baseDetailXmlTable') as Table | null;
		const compareTable = this.byId('compareDetailXmlTable') as Table | null;
		if (!baseTable || !compareTable) {
			return;
		}

		// Both tables grow independently; ensure the target row is rendered on each
		// before scrolling. Scrolling the base pane drives the compare pane through
		// the existing scroll-sync, so only the base side needs scrollIntoView.
		this.growTableToIndex(baseTable, rowIndex, () => {
			this.growTableToIndex(compareTable, rowIndex, () => {
				window.setTimeout(() => {
					this.highlightRowAt(baseTable, rowIndex, true);
					this.highlightRowAt(compareTable, rowIndex, false);
				}, 50);
			});
		});
	}

	/** Grow a responsive table until at least index+1 items are rendered, then run done(). */
	private growTableToIndex(table: Table, index: number, done: () => void): void {
		const ext = table as unknown as {
			getGrowingInfo?: () => { actual?: number } | undefined;
			_oGrowingDelegate?: { requestNewPage?: () => void };
		};
		const actual = ext.getGrowingInfo?.()?.actual ?? table.getItems().length;
		if (index < actual) {
			done();
			return;
		}
		const delegate = ext._oGrowingDelegate;
		if (delegate && typeof delegate.requestNewPage === 'function') {
			const onFinished = () => {
				table.detachEvent('updateFinished', onFinished);
				this.growTableToIndex(table, index, done);
			};
			table.attachEvent('updateFinished', onFinished);
			delegate.requestNewPage();
		} else {
			done();
		}
	}

	private highlightRowAt(table: Table, rowIndex: number, scroll: boolean): void {
		table.getItems().forEach((item) => item.removeStyleClass('versionDetailXmlHighlighted'));
		const item = table.getItems()[rowIndex];
		if (item) {
			item.addStyleClass('versionDetailXmlHighlighted');
			if (scroll) {
				item.getDomRef()?.scrollIntoView({ block: 'center', inline: 'nearest' });
			}
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
			highlight: 'None',
			lineType: 'same' as const
		}));
	}

	/**
	 * Dùng LCS line-level diff để tạo hai mảng có cùng độ dài (aligned).
	 * Dòng bị xóa ở base → compare có empty row (lineNo=0).
	 * Dòng được thêm ở compare → base có empty row (lineNo=0).
	 */
	private buildAlignedXmlLines(baseXml: string, compareXml: string): { base: XmlLineEntry[]; compare: XmlLineEntry[] } {
		const ops = computeLineDiff(baseXml.split('\n'), compareXml.split('\n'), normalizeXmlLine);
		const emptyRow = (): XmlLineEntry => ({ lineNo: 0, text: '', isWhitespace: true, highlight: 'None', lineType: 'empty' });

		// Giống lineSimilarity trong buildCompareHtml: dùng normalized key
		const lineSimilarity = (a: string, b: string): number => {
			const ka = normalizeXmlLine(a);
			const kb = normalizeXmlLine(b);
			if (ka === kb) return 1;
			const tok = (s: string) => new Set(s.match(/\S+/g) ?? []);
			const sa = tok(ka), sb = tok(kb);
			if (sa.size === 0 && sb.size === 0) return 1;
			if (sa.size === 0 || sb.size === 0) return 0;
			let common = 0;
			sa.forEach(t => { if (sb.has(t)) common++; });
			return (2 * common) / (sa.size + sb.size);
		};

		// Merge adjacent (del, ins) → 'change' khi đủ tương đồng (≥50%),
		// giống logic buildCompareHtml → base và compare canh hàng cùng row
		type MergedOp =
			| { op: 'same';   baseLine: string; compareLine: string }
			| { op: 'del';    line: string }
			| { op: 'ins';    line: string }
			| { op: 'change'; baseLine: string; compareLine: string };

		const merged: MergedOp[] = [];
		let k = 0;
		while (k < ops.length) {
			const cur  = ops[k];
			const next = k + 1 < ops.length ? ops[k + 1] : undefined;
			if (cur.op === 'del' && next?.op === 'ins' && lineSimilarity(cur.line, next.line) >= 0.5) {
				merged.push({ op: 'change', baseLine: cur.line, compareLine: next.line });
				k += 2;
			} else {
				merged.push(cur);
				k++;
			}
		}

		const base: XmlLineEntry[] = [];
		const compare: XmlLineEntry[] = [];
		let bNo = 1, cNo = 1;

		for (const op of merged) {
			if (op.op === 'same') {
				base.push({ lineNo: bNo++, text: op.baseLine, isWhitespace: !op.baseLine.trim(), highlight: 'None', lineType: 'same' });
				compare.push({ lineNo: cNo++, text: op.compareLine, isWhitespace: !op.compareLine.trim(), highlight: 'None', lineType: 'same' });
			} else if (op.op === 'del') {
				base.push({ lineNo: bNo++, text: op.line, isWhitespace: !op.line.trim(), highlight: 'None', lineType: 'del' });
				compare.push(emptyRow());
			} else if (op.op === 'ins') {
				base.push(emptyRow());
				compare.push({ lineNo: cNo++, text: op.line, isWhitespace: !op.line.trim(), highlight: 'None', lineType: 'ins' });
			} else {
				// change: 2 dòng xuất hiện cùng row, base đỏ / compare xanh — không có empty padding
				base.push({ lineNo: bNo++, text: op.baseLine, isWhitespace: !op.baseLine.trim(), highlight: 'None', lineType: 'del' });
				compare.push({ lineNo: cNo++, text: op.compareLine, isWhitespace: !op.compareLine.trim(), highlight: 'None', lineType: 'ins' });
			}
		}

		return { base, compare };
	}

	private applyLineHighlights(lines: XmlLineEntry[], _lineHighlights: Map<number, string>): XmlLineEntry[] {
		// Node-diff backend tô theo range của cả node cha (không phải từng dòng thực sự đổi).
		// Điều này gây false positive: mọi dòng trong range của một node MODIFIED đều vàng,
		// kể cả dòng opening tag hay sibling không thay đổi gì.
		// Thông tin semantic diff đã được hiển thị đầy đủ ở Node Tree panel phía trên.
		// → Tắt hoàn toàn node-diff ở XML view; chỉ dùng line-level diff (del/ins/same).
		return lines.map((line) => ({ ...line, highlight: 'None' }));
	}

	private getLineStarts(path: string): number[] {
		const model = this.getModel('detailCompare') as JSONModel;
		return (model.getProperty(path) as number[]) ?? [];
	}
}
