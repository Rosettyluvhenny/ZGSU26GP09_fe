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
	getContextByIndex(index: number): { getObject: () => nodeTreeViewItem } | undefined;
	isExpanded(index: number): boolean;
	getMetadata?(): { getName(): string };
}

import type { nodeDiffEntry, nodeTreeViewItem, registryDetail, xmlLineEntry } from '../model/types';
import { applyNodeDiffStatus, buildLineHighlightMap, buildNodeTree, canMergeAsXmlModification, computeLineDiff, highlightXmlLine, normalizeXmlLine, offsetToLine, prettyPrintXml } from '../services/XmlNodeUtils';
import { analyzeChanges, type ChangeRow, type ChangeSeverity } from '../services/ChangeAnalysis';

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
	private baseXmlLinesAll: xmlLineEntry[] = [];
	private compareXmlLinesAll: xmlLineEntry[] = [];
	/** Rows of unchanged context kept around each change in "Changes only" mode. */
	private static readonly CHANGES_CONTEXT = 3;
	/** Full change list kept so the severity filter can toggle without re-analyzing. */
	private changeRowsAll: ChangeRow[] = [];
	/** semanticId -> line number on each side, so a change row can jump into both XML panes. */
	private changeLineIndex = new Map<string, { baseLine: number; compareLine: number }>();
	/** Set while scrolling both panes programmatically so the scroll-sync doesn't fight it. */
	private suppressScrollSync = false;
	private _sendMailDialogPromise: Promise<Dialog> | null = null;
	private _sendMailDialog: Dialog | null = null;
	/** Guards against overlapping loadCompareWorkspace calls when routes change quickly. */
	private loadToken = 0;
	private highlightClearTimer: number | null = null;
	private static readonly HIGHLIGHT_MS = 1400;

	public onInit(): void {
		const model = new JSONModel({
			compareWorkspaceBusy: false,
			baseDetail: null,
			compareDetail: null,
			baseTree: [],
			compareTree: [],
			baseXmlLines: [] as xmlLineEntry[],
			compareXmlLines: [] as xmlLineEntry[],
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
			xmlViewMode: 'all',
			changeRows: [] as ChangeRow[],
			changeFilter: 'all',
			changeHeadline: '',
			changeBreaking: 0,
			changeCompatible: 0,
			changeTotal: 0
		});
		// Default sizeLimit is 100; XML/change rows and trees routinely exceed that.
		model.setSizeLimit(100000);
		this.setModel(model, 'detailCompare');
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

		const baseDetail = model.getProperty('/baseDetail') as { serviceDefId?: string } | null;
		return {
			label: `Comparison of two versions of ${baseDetail?.serviceDefId || 'a service'} (BASE vs COMPARE)`,
			xml: `<!-- BASE XML -->\n${clip(baseXml)}\n\n<!-- COMPARE XML -->\n${clip(compareXml)}`,
			suggestions: ['Explain the differences', 'Any breaking changes?', 'Which entities were added or removed?'],
			storageKey: this.baseDetailId && this.compareDetailId ? `compare.${this.baseDetailId}_${this.compareDetailId}` : undefined
		};
	}

	// ── Send Mail ────────────────────────────────────────────────────────────

	public onSendMail(): void {
		const detailModel = this.getModel('detailCompare') as JSONModel;
		const baseDetail = detailModel.getProperty('/baseDetail') as { serviceDefId?: string } | null;
		const defaultSubject = baseDetail?.serviceDefId
			? `XML Comparison: ${baseDetail.serviceDefId}`
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

		// Full XML > 500 KB: ask before sending. Emphasize Full (user already chose that mode)
		// so Enter / primary button does NOT silently fall back to Diff.
		if (emailMode === 'full' && htmlSizeKb > 500) {
			const diffContent = this.buildCompareHtml(basePrettyXml, comparePrettyXml, subject, 'diff');
			const diffKb = Math.round(diffContent.length / 1024);
			const ACTION_DIFF = 'Send Diff Only';
			const ACTION_FULL = 'Try Full Anyway';
			const choice = await new Promise<'diff' | 'full' | 'cancel'>((resolve) => {
				MessageBox.show(
					`Full XML is ${htmlSizeKb} KB which may exceed the backend limit.\n\n` +
					`• ${ACTION_DIFF} (${diffKb} KB) — recommended for delivery\n` +
					`• ${ACTION_FULL} (${htmlSizeKb} KB) — may fail on backend/Gmail\n` +
					`• Cancel`,
					{
						icon: MessageBox.Icon.WARNING,
						title: 'Large email',
						actions: [ACTION_FULL, ACTION_DIFF, MessageBox.Action.CANCEL],
						emphasizedAction: ACTION_FULL,
						onClose: (action?: string) => {
							if (action === ACTION_DIFF) {
								resolve('diff');
							} else if (action === ACTION_FULL) {
								resolve('full');
							} else {
								resolve('cancel');
							}
						}
					}
				);
			});

			if (choice === 'cancel') {
				return;
			}
			if (choice === 'diff') {
				htmlContent = diffContent;
				htmlSizeKb = diffKb;
				emailMode = 'diff';
			} else {
				// Rebuild explicitly so we never keep a stale/wrong payload.
				htmlContent = this.buildCompareHtml(basePrettyXml, comparePrettyXml, subject, 'full');
				htmlSizeKb = Math.round(htmlContent.length / 1024);
				emailMode = 'full';
			}
		}

		MessageToast.show(emailMode === 'full' ? `Sending Full XML (${htmlSizeKb} KB)…` : `Sending Diff Only (${htmlSizeKb} KB)…`);

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
				MessageBox.success('Email sent successfully to ' + recipients + '.');
			} else {
				const detail = result.failedRecip ? `\nFailed recipients: ${result.failedRecip}` : '';
				MessageBox.warning('Email may not have been delivered.' + detail);
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

	/** Split and validate email list (separated by ; or ,). */
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
	 * Highlight XML, preserve indentation (space → &nbsp;), and use inline styles
	 * instead of CSS classes so colors survive when Gmail truncates and strips <style>.
	 */
	private highlightForEmail(line: string): string {
		const indent = /^( +)/.exec(line)?.[1] ?? '';
		const indentHtml = indent.replace(/ /g, '&nbsp;');
		let html = indentHtml + highlightXmlLine(line.slice(indent.length));
		// Inline styles instead of classes → Gmail-safe
		html = html
			.replace(/class="xmlTokPunct"/g, 'style="color:#00C"')
			.replace(/class="xmlTokTag"/g, 'style="color:#00008B"')
			.replace(/class="xmlTokAttr"/g, 'style="color:#7D0045"')
			.replace(/class="xmlTokVal"/g, 'style="color:#006400"')
			.replace(/class="xmlTokCmt"/g, 'style="color:#6a9955"');
		return html;
	}

	private buildCompareHtml(baseXml: string, compareXml: string, title: string, mode: 'diff' | 'full' = 'diff'): string {
		const escHtml = (s: string): string =>
			s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

		// Full mode uses a CSS <style> block so each cell only needs class="n"/"x"/...
		// instead of ~130-char inline styles → saves ~250 KB on large files.
		// Diff mode keeps inline styles for Gmail compatibility (style blocks are stripped when truncated).
		const useClasses = mode === 'full';

		// Full mode: CSS classes for SAME rows only (no diff color needed).
		// Del/ins/change rows always use inline styles so diff colors show even if the
		// email client strips the <style> block (e.g. Gmail).
		// Same rows are ~80-90% of lines → saves ~200 KB.
		const cssBlock = useClasses ? `<style>
td.n{padding:2px 4px;border:1px solid #ddd;color:#999;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%}
td.x{padding:2px 6px;border:1px solid #ddd;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%}
span.xt{color:#00008B}span.xa{color:#7D0045}span.xv{color:#006400}span.xp{color:#00C}span.xc{color:#6a9955}
</style>` : '';

		// Same rows: CSS class (full) or inline style (diff)
		const S_N = useClasses ? 'class="n"' : 'style="padding:2px 4px;border:1px solid #ddd;color:#999;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%"';
		const S_X = useClasses ? 'class="x"' : 'style="padding:2px 6px;border:1px solid #ddd;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%"';
		// Del/ins/change rows: always inline style so diff colors do not depend on <style>
		const S_N_D = 'style="padding:2px 4px;border:1px solid #ffd7d5;background:#ffd7d5;color:#c00;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%"';
		const S_N_I = 'style="padding:2px 4px;border:1px solid #ccffd8;background:#ccffd8;color:#080;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%"';
		const S_N_M = 'style="padding:2px 4px;border:1px solid #fff3cd;background:#fff3cd;color:#856404;text-align:right;font-family:monospace;font-size:11px;white-space:nowrap;width:3%"';
		const S_N_E = 'style="padding:2px 4px;border:1px solid #eee;background:#f8f8f8;width:3%"';
		const S_X_D = 'style="padding:2px 6px;border:1px solid #ffd7d5;background:#ffd7d5;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%"';
		const S_X_I = 'style="padding:2px 6px;border:1px solid #ccffd8;background:#ccffd8;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%"';
		const S_X_M = 'style="padding:2px 6px;border:1px solid #fff3cd;background:#fff3cd;white-space:pre-wrap;overflow-wrap:break-word;font-family:monospace;font-size:11px;vertical-align:top;width:47%"';
		const S_X_E = 'style="padding:2px 6px;border:1px solid #eee;background:#f8f8f8;width:47%"';
		const SEP = 'style="padding:3px 8px;text-align:center;color:#888;background:#f5f5f5;font-family:sans-serif;font-size:11px;border:1px solid #ddd"';

		// ── Build aligned rows with LCS line diff ──────────────────────────────
		interface AlignedRow { op: 'same' | 'del' | 'ins' | 'change'; bNo: number; cNo: number; bLine: string; cLine: string; }

		// Normalize attributes before LCS compare; keep original lines for display.
		const ops = computeLineDiff(baseXml.split('\n'), compareXml.split('\n'), normalizeXmlLine);

		// Merge adjacent (del, ins) → change only when identity unchanged (NodeTree MOD).
		const merged: Array<{ op: 'same' | 'del' | 'ins' | 'change'; bLine: string; cLine: string }> = [];
		let k = 0;
		while (k < ops.length) {
			const cur = ops[k];
			const next = k + 1 < ops.length ? ops[k + 1] : undefined;
			if (cur.op === 'del' && next !== undefined && next.op === 'ins'
				&& canMergeAsXmlModification(cur.line, next.line)) {
				merged.push({ op: 'change', bLine: cur.line, cLine: next.line });
				k += 2;
			} else if (cur.op === 'del') {
				merged.push({ op: 'del', bLine: cur.line, cLine: '' });
				k++;
			} else if (cur.op === 'ins') {
				merged.push({ op: 'ins', bLine: '', cLine: cur.line });
				k++;
			} else {
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

		// Full mode: syntax token spans use classes instead of styles (saves ~30-40KB more)
		const hlEmail = (line: string) => {
			const h = this.highlightForEmail(line);
			if (!useClasses) return h;
			return h
				.replace(/style="color:#00C"/g, 'class="xp"')
				.replace(/style="color:#00008B"/g, 'class="xt"')
				.replace(/style="color:#7D0045"/g, 'class="xa"')
				.replace(/style="color:#006400"/g, 'class="xv"')
				.replace(/style="color:#6a9955"/g, 'class="xc"');
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
			// change / modified: yellow on both sides (not del/ins)
			const [bHtml, cHtml] = this.inlineDiffHtml(row.bLine, row.cLine);
			return `<tr><td ${S_N_M}>${row.bNo}</td><td ${S_X_M}>${bHtml}</td><td ${S_N_M}>${row.cNo}</td><td ${S_X_M}>${cHtml}</td></tr>`;
		};

		let rows = '';
		let changedCount = 0;
		alignedRows.forEach(r => { if (r.op !== 'same') changedCount++; });

		if (mode === 'full') {
			for (const row of alignedRows) rows += renderRow(row);
		} else {
			// Diff mode: changed rows + 3 lines of context
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
	 * Compute inline word-level diff between two lines.
	 * Returns [baseHtml, compareHtml] with <mark class="del"> / <mark class="ins"> on changes.
	 */
	private inlineDiffHtml(base: string, compare: string): [string, string] {
		const esc = (s: string) =>
			s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

		// Split into tokens: contiguous non-space runs, and whitespace
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

		// Backtrack to build the operation list
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
				cmpHtml += escaped;
			} else if (op === 'del') {
				baseHtml += `<mark style="background:#ffd7d5;color:inherit">${escaped}</mark>`;
			} else {
				cmpHtml += `<mark style="background:#ccffd8;color:inherit">${escaped}</mark>`;
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

		this.revealTreeNode(node, 'base');
		// Clear selection so clicking the same node again re-fires selectionChange + flash.
		this.clearTreeSelection(event);
	}

	public onCompareTreeSelectionChange(event: UI5Event): void {
		const node = this.getNodeFromEvent(event);
		if (!node) {
			return;
		}

		this.revealTreeNode(node, 'compare');
		this.clearTreeSelection(event);
	}

	private clearTreeSelection(event: UI5Event): void {
		const tree = event.getSource() as unknown as { removeSelections?: (b?: boolean) => void };
		window.setTimeout(() => tree.removeSelections?.(true), 0);
	}

	/** Selecting a node in either tree scrolls both XML panes to that element. */
	private revealTreeNode(node: nodeTreeViewItem, side: 'base' | 'compare'): void {
		const fallbackLine = node.lineStart
			|| offsetToLine(node.offsetStart, this.getLineStarts(side === 'base' ? '/baseLineStarts' : '/compareLineStarts'));
		const lines = this.changeLineIndex.get(node.semanticId)
			?? (side === 'base' ? { baseLine: fallbackLine, compareLine: 0 } : { baseLine: 0, compareLine: fallbackLine });

		const rowIndex = this.findAlignedIndex(lines, side);
		if (rowIndex < 0) {
			// Not part of the aligned rows (e.g. the fallback single-node tree).
			this.selectXmlLine(side === 'base' ? 'baseDetailXmlTable' : 'compareDetailXmlTable', fallbackLine);
			return;
		}

		this.syncChangeCursor(rowIndex);
		this.revealAlignedRow(rowIndex);
	}

	private async loadCompareWorkspace(): Promise<void> {
		if (!this.baseDetailId || !this.compareDetailId) {
			return;
		}

		const loadToken = ++this.loadToken;
		const model = this.getModel('detailCompare') as JSONModel;
		model.setProperty('/baseDetailId', this.baseDetailId);
		model.setProperty('/compareDetailId', this.compareDetailId);
		model.setProperty('/compareWorkspaceBusy', true);
		model.setProperty('/baseTree', []);
		model.setProperty('/compareTree', []);

		try {
			const detailService = this.getOwnerComponent().getDetailService();
			const [baseDetail, compareDetail, baseParsedDetail, compareParsedDetail, baseNodeTree, compareNodeTree, compareNodeDiff] = await Promise.all([
				detailService.getDetail(this.baseDetailId),
				detailService.getDetail(this.compareDetailId),
				detailService.getParsedDetail(this.baseDetailId),
				detailService.getParsedDetail(this.compareDetailId),
				detailService.getNodeTree(this.baseDetailId),
				detailService.getNodeTree(this.compareDetailId),
				detailService.compareNodeTree(this.baseDetailId, this.compareDetailId)
			]);

			if (loadToken !== this.loadToken) {
				return;
			}

			let baseRawXml = baseParsedDetail.metadataXml || baseDetail.metadataXml || '';
			baseRawXml = baseRawXml.replace(/<\?xml[^>]*\?>\s*/gi, '');
			const { prettyXml: baseXml, rawOffsets: baseLineStarts } = prettyPrintXml(baseRawXml);

			let compareRawXml = compareParsedDetail.metadataXml || compareDetail.metadataXml || '';
			compareRawXml = compareRawXml.replace(/<\?xml[^>]*\?>\s*/gi, '');
			const { prettyXml: compareXml, rawOffsets: compareLineStarts } = prettyPrintXml(compareRawXml);

			const baseTreeRaw = buildNodeTree(baseNodeTree);
			const baseTree = baseTreeRaw.length > 0 ? baseTreeRaw : this.createFallbackNodeTree(baseDetail);

			const compareTreeRaw = buildNodeTree(compareNodeTree);
			const compareTree = compareTreeRaw.length > 0 ? compareTreeRaw : this.createFallbackNodeTree(compareDetail);

			this.applyLineNumbers(baseTree, baseLineStarts);
			this.applyLineNumbers(compareTree, compareLineStarts);

			const statusBySemanticId = new Map(compareNodeDiff.map((item) => [item.semanticId, item.status]));
			const compareTreeMapped = applyNodeDiffStatus(compareTree, statusBySemanticId);

			const aligned = this.buildAlignedXmlLines(baseXml, compareXml);
			let baseXmlLines = aligned.base;
			let compareXmlLines = aligned.compare;

			this.applyChangeAnalysis(compareNodeDiff, compareTreeMapped, baseTree);

			if (compareNodeDiff.length > 0) {
				this.applyDiffHighlights(compareNodeDiff, baseTree, compareTreeMapped);
				baseXmlLines = this.applyLineHighlights(baseXmlLines, buildLineHighlightMap(baseTree));
				compareXmlLines = this.applyLineHighlights(compareXmlLines, buildLineHighlightMap(compareTreeMapped));
			}

			if (loadToken !== this.loadToken) {
				return;
			}

			this.baseXmlLinesAll = baseXmlLines;
			this.compareXmlLinesAll = compareXmlLines;
			this.computeDiffTotals(baseXmlLines, compareXmlLines);

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
			model.setProperty('/xmlViewMode', 'all');
			this.applyXmlViewMode('all');

			if (compareNodeDiff.length > 0) {
				this.scheduleTreeExpansion('baseTree');
				this.scheduleTreeExpansion('compareTree');
			}
		} catch (error) {
			if (loadToken === this.loadToken) {
				await this.handleServiceError(error);
			}
		} finally {
			if (loadToken === this.loadToken) {
				model.setProperty('/compareWorkspaceBusy', false);
			}
		}
	}

	/** Apply node/attribute highlight + expand flags from a single compareNodeTree result. */
	private applyDiffHighlights(diff: nodeDiffEntry[], baseTree: nodeTreeViewItem[], compareTree: nodeTreeViewItem[]): void {
		const statusByKey = new Map<string, string>();
		diff.forEach((item) => {
			statusByKey.set(item.semanticId, item.status);
			if (Array.isArray(item.attributeDiff)) {
				item.attributeDiff.forEach((attr) => {
					statusByKey.set(`${item.semanticId}/${attr.name}`, attr.status);
				});
			}
		});

		const mapHighlight = (status?: string) => {
			if (status === 'MODIFIED') {
				return 'Warning';
			}
			if (status === 'ADDED') {
				return 'Success';
			}
			if (status === 'DELETED') {
				return 'Error';
			}
			return 'None';
		};

		const applyHighlight = (nodes: nodeTreeViewItem[], parentStatus?: string, isParentHighlighted = false): boolean => {
			let anyExpanded = false;
			for (const node of nodes) {
				let status = statusByKey.get(node.semanticId);

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
		applyHighlight(compareTree);
	}



	/** Builds the reviewable change list and the summary counters from the node diff. */
	private applyChangeAnalysis(diff: nodeDiffEntry[] | null, compareTree: nodeTreeViewItem[], baseTree: nodeTreeViewItem[]): void {
		const model = this.getModel('detailCompare') as JSONModel;
		const analysis = analyzeChanges(diff, compareTree, baseTree);

		this.changeRowsAll = analysis.rows;
		this.indexChangeLines(baseTree, compareTree);
		model.setProperty('/changeHeadline', analysis.headline);
		model.setProperty('/changeBreaking', analysis.breaking);
		model.setProperty('/changeCompatible', analysis.compatible);
		model.setProperty('/changeTotal', analysis.total);

		// Land on the risky changes when there are any, otherwise show everything.
		const filter = analysis.breaking > 0 ? 'Breaking' : 'all';
		model.setProperty('/changeFilter', filter);
		this.applyChangeFilter(filter);
	}

	public onChangeFilterSelect(): void {
		const model = this.getModel('detailCompare') as JSONModel;
		this.applyChangeFilter((model.getProperty('/changeFilter') as string) ?? 'all');
	}

	private applyChangeFilter(filter: string): void {
		const model = this.getModel('detailCompare') as JSONModel;
		const rows = filter === 'all' ? this.changeRowsAll : this.changeRowsAll.filter((row) => row.severity === filter);
		model.setProperty('/changeRows', rows);
	}

	/** Records where each element sits in both pretty-printed documents. */
	private indexChangeLines(baseTree: nodeTreeViewItem[], compareTree: nodeTreeViewItem[]): void {
		this.changeLineIndex.clear();

		const walk = (nodes: nodeTreeViewItem[], side: 'base' | 'compare'): void => {
			for (const node of nodes) {
				if (node.semanticId) {
					const entry = this.changeLineIndex.get(node.semanticId) ?? { baseLine: 0, compareLine: 0 };
					if (side === 'base') {
						entry.baseLine = entry.baseLine || node.lineStart;
					} else {
						entry.compareLine = entry.compareLine || node.lineStart;
					}
					this.changeLineIndex.set(node.semanticId, entry);
				}
				if (node.children && node.children.length > 0) {
					walk(node.children, side);
				}
			}
		};

		walk(baseTree, 'base');
		walk(compareTree, 'compare');
	}

	/** Clicking a change scrolls both XML panes to the element it refers to. */
	public onChangeRowPress(event: UI5Event): void {
		const item = (event as ListBase$ItemPressEvent).getParameter('listItem') as { getBindingContext: (name?: string) => { getObject: () => ChangeRow } | null } | null;
		const row = item?.getBindingContext('detailCompare')?.getObject();
		if (row?.semanticId) {
			this.revealChange(row.semanticId);
		}
	}

	private revealChange(semanticId: string): void {
		const lines = this.changeLineIndex.get(semanticId);
		if (!lines) {
			return;
		}

		const model = this.getModel('detailCompare') as JSONModel;
		let rowIndex = this.findAlignedIndex(lines);

		// In "Changes only" mode the target row may have been collapsed away.
		if (rowIndex < 0 && (model.getProperty('/xmlViewMode') as string) === 'changes') {
			model.setProperty('/xmlViewMode', 'all');
			this.applyXmlViewMode('all');
			rowIndex = this.findAlignedIndex(lines);
		}
		if (rowIndex < 0) {
			return;
		}

		// Keep prev/next continuing from wherever the user jumped to.
		this.syncChangeCursor(rowIndex);
		this.revealAlignedRow(rowIndex);
	}

	/**
	 * Maps a pair of document line numbers onto an index in the currently bound
	 * (possibly filtered) aligned rows. Removed elements only exist on the base
	 * side and added ones only on the compare side, so either may be missing.
	 */
	private findAlignedIndex(lines: { baseLine: number; compareLine: number }, prefer: 'base' | 'compare' = 'base'): number {
		const model = this.getModel('detailCompare') as JSONModel;
		const rows = {
			base: { lines: (model.getProperty('/baseXmlLines') as xmlLineEntry[]) ?? [], lineNo: lines.baseLine },
			compare: { lines: (model.getProperty('/compareXmlLines') as xmlLineEntry[]) ?? [], lineNo: lines.compareLine }
		};

		// An element that moved sits at a different aligned row on each side, so
		// look at the side the user actually clicked first.
		for (const side of prefer === 'base' ? ['base', 'compare'] as const : ['compare', 'base'] as const) {
			const { lines: sideLines, lineNo } = rows[side];
			if (lineNo > 0) {
				const index = sideLines.findIndex((line) => line.lineNo === lineNo);
				if (index >= 0) {
					return index;
				}
			}
		}
		return -1;
	}

	/** Moves the prev/next cursor to the change block containing rowIndex. */
	private syncChangeCursor(rowIndex: number): void {
		if (this.changeBlockStarts.length === 0) {
			return;
		}

		let cursor = 0;
		for (let i = 0; i < this.changeBlockStarts.length; i++) {
			if (this.changeBlockStarts[i] > rowIndex) {
				break;
			}
			cursor = i;
		}

		this.changeBlockCursor = cursor;
		const model = this.getModel('detailCompare') as JSONModel;
		model.setProperty('/navPosition', `${cursor + 1} / ${this.changeBlockStarts.length}`);
	}

	public formatSeverityState(severity: ChangeSeverity): 'Success' | 'Warning' | 'Error' | 'Information' | 'None' {
		switch (severity) {
			case 'Breaking':
				return 'Error';
			case 'Compatible':
				return 'Success';
			default:
				return 'None';
		}
	}

	/** Renders an empty before/after cell as an em dash so the table stays readable. */
	public formatChangeValue(value: string): string {
		return value && value.length > 0 ? value : '—';
	}

	private scheduleTreeExpansion(treeId: string): void {
		const tree = this.byId(treeId) as TreeTable;
		if (!tree) {
			return;
		}

		tree.attachEventOnce('updateFinished', () => {
			const binding = tree.getBinding('items') as unknown as ExtendedTreeBinding;
			if (!binding || typeof binding.expand !== 'function') {
				return;
			}

			let i = 0;
			let limit = 0;
			while (i < binding.getLength() && limit < 100000) {
				limit++;
				const context = binding.getContextByIndex(i);
				const node = context?.getObject();

				if (node && node.shouldExpand && node.children && node.children.length > 0) {
					if (typeof binding.isExpanded === 'function' && !binding.isExpanded(i)) {
						binding.expand(i);
					}
				}
				i++;
			}
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

		// The trees are not aligned row-for-row (each side has its own node count),
		// so mirroring the pixel offset is the only meaningful option there.
		if (treeMode) {
			const pixelSync = (source: HTMLElement, target: HTMLElement): void => {
				if (syncing || this.suppressScrollSync) {
					return;
				}
				syncing = true;
				target.scrollTop = source.scrollTop;
				target.scrollLeft = source.scrollLeft;
				window.requestAnimationFrame(() => {
					syncing = false;
				});
			};

			left.addEventListener('scroll', () => pixelSync(left, right));
			right.addEventListener('scroll', () => pixelSync(right, left));
			return;
		}

		// The XML panes *are* aligned row-for-row, but their rows differ in height:
		// long lines wrap, and padding rows collapse while the opposite side holds
		// real content. Mirroring scrollTop therefore drifts a little further out of
		// step with every change block, so anchor on the row index instead.
		let pendingFrame = 0;
		const rowSync = (sourceTableId: string, targetTableId: string, source: HTMLElement, target: HTMLElement): void => {
			if (syncing || this.suppressScrollSync || pendingFrame) {
				return;
			}
			// Throttle to one alignment per frame. The re-entrancy flag is cleared on a
			// timer rather than inside the frame, so a frame that never arrives (hidden
			// tab, where rAF is suspended) cannot wedge the sync permanently.
			pendingFrame = window.requestAnimationFrame(() => {
				pendingFrame = 0;
				if (this.suppressScrollSync) {
					return;
				}
				syncing = true;
				this.alignPaneToRow(sourceTableId, targetTableId, source, target);
				target.scrollLeft = source.scrollLeft;
				window.setTimeout(() => {
					syncing = false;
				}, 0);
			});
		};

		left.addEventListener('scroll', () => rowSync('baseDetailXmlTable', 'compareDetailXmlTable', left, right));
		right.addEventListener('scroll', () => rowSync('compareDetailXmlTable', 'baseDetailXmlTable', right, left));
	}

	/** Scrolls target so the row the source pane is showing at its top sits at the target's top. */
	private alignPaneToRow(sourceTableId: string, targetTableId: string, source: HTMLElement, target: HTMLElement): void {
		const sourceTable = this.byId(sourceTableId) as Table | null;
		const targetTable = this.byId(targetTableId) as Table | null;
		if (!sourceTable || !targetTable) {
			return;
		}

		const sourceItems = sourceTable.getItems();
		const targetItems = targetTable.getItems();
		if (sourceItems.length === 0 || targetItems.length === 0) {
			return;
		}

		// Rows are laid out top to bottom, so the first still-visible row can be
		// found by binary search rather than measuring every row on every scroll.
		const sourceTop = source.getBoundingClientRect().top;
		let low = 0;
		let high = sourceItems.length - 1;
		let index = 0;
		while (low <= high) {
			const mid = (low + high) >> 1;
			const rect = sourceItems[mid].getDomRef()?.getBoundingClientRect();
			if (!rect) {
				break;
			}
			if (rect.bottom <= sourceTop) {
				low = mid + 1;
			} else {
				index = mid;
				high = mid - 1;
			}
		}

		const sourceRow = sourceItems[index]?.getDomRef();
		const targetRow = targetItems[Math.min(index, targetItems.length - 1)]?.getDomRef();
		if (!sourceRow || !targetRow) {
			return;
		}

		const withinRow = sourceTop - sourceRow.getBoundingClientRect().top;
		const targetTop = target.getBoundingClientRect().top;
		target.scrollTop += targetRow.getBoundingClientRect().top - targetTop + withinRow;
	}

	/**
	 * Brings the same aligned row into view in *both* panes and highlights it.
	 *
	 * Each pane is scrolled to its own row rather than one pane being scrolled and
	 * the other following the scroll-sync, because differing row heights would put
	 * the second pane on a different line.
	 */
	private revealAlignedRow(rowIndex: number): void {
		const baseTable = this.byId('baseDetailXmlTable') as Table | null;
		const compareTable = this.byId('compareDetailXmlTable') as Table | null;
		if (!baseTable || !compareTable) {
			return;
		}

		this.growTableToIndex(baseTable, rowIndex, () => {
			this.growTableToIndex(compareTable, rowIndex, () => {
				window.setTimeout(() => {
					this.suppressScrollSync = true;
					this.highlightRowAt(baseTable, rowIndex, false);
					this.highlightRowAt(compareTable, rowIndex, false);
					this.scheduleHighlightClear(baseTable, compareTable);
					this.scrollPaneToRow('baseXmlScroll', baseTable, rowIndex);
					this.scrollPaneToRow('compareXmlScroll', compareTable, rowIndex);
					// The change list and trees sit above the XML panes, so bring the
					// diff itself into view or the user never sees the row we landed on.
					this.ensureSectionVisible('xmlDiffToolbar');
					window.setTimeout(() => {
						this.suppressScrollSync = false;
					}, 150);
				}, 50);
			});
		});
	}

	/**
	 * Scrolls the page so the given section is on screen, but only when it is not
	 * already showing — otherwise stepping through changes with prev/next would
	 * yank the page on every click.
	 */
	private ensureSectionVisible(controlId: string): void {
		const dom = this.byId(controlId)?.getDomRef();
		if (!dom) {
			return;
		}

		// The page content scrolls inside sap.f.DynamicPage's own wrapper, not the
		// window (UI5 sets overflow:hidden on <html>), so walk up to whichever
		// ancestor declares a scrollable overflow instead of trusting
		// scrollIntoView to find it.
		let scroller: HTMLElement | null = null;
		let node = dom.parentElement;
		while (node) {
			const overflowY = window.getComputedStyle(node).overflowY;
			if (overflowY === 'auto' || overflowY === 'scroll') {
				scroller = node;
				break;
			}
			node = node.parentElement;
		}
		if (!scroller) {
			return;
		}

		const rect = dom.getBoundingClientRect();
		const scrollerRect = scroller.getBoundingClientRect();
		if (rect.top >= scrollerRect.top && rect.bottom <= scrollerRect.bottom) {
			return;
		}

		scroller.scrollTop += rect.top - scrollerRect.top;
	}

	/** Centres a row inside its own scroll container without touching any ancestor. */
	private scrollPaneToRow(scrollId: string, table: Table, rowIndex: number): void {
		const scroller = this.findScrollElement(scrollId, false);
		const row = table.getItems()[rowIndex]?.getDomRef();
		if (!scroller || !row) {
			return;
		}

		const rowRect = row.getBoundingClientRect();
		const scrollerRect = scroller.getBoundingClientRect();
		const offset = rowRect.top - scrollerRect.top - (scroller.clientHeight - rowRect.height) / 2;
		scroller.scrollTop = Math.max(0, scroller.scrollTop + offset);
	}

	private findScrollElement(controlId: string, _treeMode: boolean): HTMLElement | null {
		const domRef = this.byId(controlId)?.getDomRef();
		if (!domRef) {
			return null;
		}

		// sap.m.ScrollContainer scrolls on its own root element. The inner
		// .sapMScrollContScroll div is just the content wrapper (overflow: visible),
		// so it never fires scroll events and ignores scrollTop.
		const scrolls = (element: Element): boolean => {
			const overflowY = window.getComputedStyle(element).overflowY;
			return overflowY === 'auto' || overflowY === 'scroll';
		};

		if (scrolls(domRef)) {
			return domRef as HTMLElement;
		}
		const inner = domRef.querySelector<HTMLElement>('.sapMScrollContScroll');
		return inner && scrolls(inner) ? inner : (domRef as HTMLElement);
	}

	private getNodeFromEvent(event: UI5Event): nodeTreeViewItem | null {
		const item = (event as ListBase$ItemPressEvent).getParameter('listItem') as { getBindingContext: (name?: string) => { getObject: () => nodeTreeViewItem } | null } | null;
		const context = item?.getBindingContext('detailCompare');
		return context?.getObject() ?? null;
	}

	private applyLineNumbers(nodes: nodeTreeViewItem[], lineStarts: number[]): void {
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
		this.clearXmlHighlights(table);
		const item = table.getItems().find((listItem) => {
			const context = listItem.getBindingContext('detailCompare');
			return (context?.getObject() as xmlLineEntry | null)?.lineNo === lineNo;
		});
		if (item) {
			item.addStyleClass('versionDetailXmlHighlighted');
			item.getDomRef()?.scrollIntoView({ block: 'center', inline: 'nearest' });
			this.scheduleHighlightClear(table);
		}
	}

	// ── Change navigation (prev/next across the aligned XML panes) ────────────

	/** Set the added/removed/changed totals from the full aligned diff (mode-independent). */
	private computeDiffTotals(baseLines: xmlLineEntry[], compareLines: xmlLineEntry[]): void {
		const model = this.getModel('detailCompare') as JSONModel;
		let added = 0;
		let removed = 0;
		let changed = 0;

		const rowCount = Math.max(baseLines.length, compareLines.length);
		for (let i = 0; i < rowCount; i++) {
			const b = baseLines[i]?.lineType ?? 'same';
			const c = compareLines[i]?.lineType ?? 'same';

			if (b === 'mod' || c === 'mod' || (b === 'del' && c === 'ins')) {
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
	private indexChangeBlocks(baseLines: xmlLineEntry[], compareLines: xmlLineEntry[]): void {
		const model = this.getModel('detailCompare') as JSONModel;
		const blockStarts: number[] = [];
		let inBlock = false;

		const rowCount = Math.max(baseLines.length, compareLines.length);
		for (let i = 0; i < rowCount; i++) {
			const b = baseLines[i]?.lineType ?? 'same';
			const c = compareLines[i]?.lineType ?? 'same';
			// Test for an actual del/ins on either side so the collapsed-gap
			// separators (blank on both sides) are not counted as changes.
			const isChangeRow = b === 'del' || b === 'ins' || b === 'mod' || c === 'del' || c === 'ins' || c === 'mod';
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
	private buildChangesOnlyView(baseAll: xmlLineEntry[], compareAll: xmlLineEntry[]): { base: xmlLineEntry[]; compare: xmlLineEntry[] } {
		const rowCount = Math.max(baseAll.length, compareAll.length);
		const changed = new Set<number>();
		for (let i = 0; i < rowCount; i++) {
			const b = baseAll[i]?.lineType ?? 'same';
			const c = compareAll[i]?.lineType ?? 'same';
			if (b !== 'same' || c !== 'same') {
				changed.add(i);
			}
		}

		const base: xmlLineEntry[] = [];
		const compare: xmlLineEntry[] = [];
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

		const gapRow = (gap: number): xmlLineEntry => ({
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

		this.revealAlignedRow(rowIndex);
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

	private highlightRowAt(table: Table, rowIndex: number, autoClear = true): void {
		this.clearXmlHighlights(table);
		const item = table.getItems()[rowIndex];
		if (!item) {
			return;
		}
		item.addStyleClass('versionDetailXmlHighlighted');
		if (autoClear) {
			this.scheduleHighlightClear(table);
		}
	}

	private clearXmlHighlights(table: Table): void {
		table.getItems().forEach((item) => item.removeStyleClass('versionDetailXmlHighlighted'));
	}

	private scheduleHighlightClear(...tables: Table[]): void {
		if (this.highlightClearTimer !== null) {
			window.clearTimeout(this.highlightClearTimer);
		}
		this.highlightClearTimer = window.setTimeout(() => {
			tables.forEach((table) => this.clearXmlHighlights(table));
			this.highlightClearTimer = null;
		}, DetailCompare.HIGHLIGHT_MS);
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

	private buildXmlLines(xml: string): xmlLineEntry[] {
		return xml.split('\n').map((text, index) => ({
			lineNo: index + 1,
			text,
			isWhitespace: text.trim().length === 0,
			highlight: 'None',
			lineType: 'same' as const
		}));
	}

	/**
	 * Use LCS line-level diff to build two equal-length (aligned) arrays.
	 * Deleted base line → empty row on compare (lineNo=0).
	 * Inserted compare line → empty row on base (lineNo=0).
	 */
	private buildAlignedXmlLines(baseXml: string, compareXml: string): { base: xmlLineEntry[]; compare: xmlLineEntry[] } {
		const ops = computeLineDiff(baseXml.split('\n'), compareXml.split('\n'), normalizeXmlLine);
		const emptyRow = (): xmlLineEntry => ({ lineNo: 0, text: '', isWhitespace: true, highlight: 'None', lineType: 'empty' });

		type MergedOp =
			| { op: 'same'; baseLine: string; compareLine: string }
			| { op: 'del'; line: string }
			| { op: 'ins'; line: string }
			| { op: 'change'; baseLine: string; compareLine: string };

		const merged: MergedOp[] = [];
		let k = 0;
		while (k < ops.length) {
			const cur = ops[k];
			const next = k + 1 < ops.length ? ops[k + 1] : undefined;
			if (cur.op === 'del' && next?.op === 'ins' && canMergeAsXmlModification(cur.line, next.line)) {
				merged.push({ op: 'change', baseLine: cur.line, compareLine: next.line });
				k += 2;
			} else {
				merged.push(cur);
				k++;
			}
		}

		const base: xmlLineEntry[] = [];
		const compare: xmlLineEntry[] = [];
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
				base.push({ lineNo: bNo++, text: op.baseLine, isWhitespace: !op.baseLine.trim(), highlight: 'None', lineType: 'mod' });
				compare.push({ lineNo: cNo++, text: op.compareLine, isWhitespace: !op.compareLine.trim(), highlight: 'None', lineType: 'mod' });
			}
		}

		return { base, compare };
	}

	private applyLineHighlights(lines: xmlLineEntry[], _lineHighlights: Map<number, string>): xmlLineEntry[] {
		// Backend node-diff paints the whole parent node range (not only changed lines).
		// That causes false positives: every line in a MODIFIED node range turns yellow,
		// including unchanged opening tags or siblings.
		// Semantic diff is already shown fully in the Node Tree panel above.
		// → Disable node-diff on the XML view; use line-level diff only (del/ins/same).
		return lines.map((line) => ({ ...line, highlight: 'None' }));
	}

	private getLineStarts(path: string): number[] {
		const model = this.getModel('detailCompare') as JSONModel;
		return (model.getProperty(path) as number[]) ?? [];
	}
}
