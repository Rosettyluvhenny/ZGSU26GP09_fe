import Controller from 'sap/ui/core/mvc/Controller';
import UIComponent from 'sap/ui/core/UIComponent';
import AppComponent from '../Component';
import Model from 'sap/ui/model/Model';
import JSONModel from 'sap/ui/model/json/JSONModel';
import ResourceModel from 'sap/ui/model/resource/ResourceModel';
import ResourceBundle from 'sap/base/i18n/ResourceBundle';
import Router from 'sap/ui/core/routing/Router';
import History from 'sap/ui/core/routing/History';
import Fragment from 'sap/ui/core/Fragment';
import MessageToast from 'sap/m/MessageToast';
import type Dialog from 'sap/m/Dialog';
import type ScrollContainer from 'sap/m/ScrollContainer';
import type { JobStatus, RegistryStatus } from '../model/types';
import AiChatService, { AI_MODEL_AUTO, type AiChatMessage, type AiModelOption } from '../services/AiChatService';
import { writeSideNavPreference } from '../services/SessionStorage';
import { highlightXmlLine } from '../services/XmlNodeUtils';

export interface AiChatContext {
	label: string;
	xml: string;
	/** Page-specific suggested prompts shown on the empty chat. */
	suggestions?: string[];
	/** Stable key for persisting the conversation in sessionStorage; omit to disable persistence. */
	storageKey?: string;
}

interface AiChatUiMessage {
	role: 'user' | 'assistant' | 'error';
	text: string;
	html: string;
}

// Only the most recent turns are sent to the model to stay within free-tier limits.
const AI_CHAT_HISTORY_LIMIT = 12;

const DEFAULT_AI_SUGGESTIONS = ['Summarize this XML', 'List entity types and keys', 'Spot potential issues'];

/**
 * @namespace com.zgp9.fe.controller
 */
export default abstract class BaseController extends Controller {
	private readonly aiChatService = new AiChatService();
	private aiChatDialogPromise: Promise<Dialog> | null = null;
	private aiChatDialog: Dialog | null = null;
	private aiChatStorageKey: string | null = null;
	public getOwnerComponent(): AppComponent {
		return super.getOwnerComponent() as AppComponent;
	}

	public getAppComponent(): AppComponent {
		return this.getOwnerComponent();
	}

	public getRouter(): Router {
		return UIComponent.getRouterFor(this);
	}

	public getResourceBundle(): Promise<ResourceBundle> {
		const model = this.getOwnerComponent().getModel('i18n') as ResourceModel;
		return model.getResourceBundle() as Promise<ResourceBundle>;
	}

	public getModel(sName?: string): Model {
		return this.getView().getModel(sName);
	}

	public setModel(oModel: Model, sName?: string): BaseController {
		this.getView().setModel(oModel, sName);
		return this;
	}

	public getUiModel(): JSONModel {
		return this.getOwnerComponent().getModel('ui') as JSONModel;
	}

	public getSessionModel(): JSONModel {
		return this.getOwnerComponent().getModel('session') as JSONModel;
	}

	public navTo(sName: string, oParameters?: object, bReplace?: boolean): void {
		this.getRouter().navTo(sName, oParameters, undefined, bReplace);
	}

	public async handleServiceError(error: unknown): Promise<void> {
		await this.getOwnerComponent().getErrorHandler().handle(error);
	}

	public formatXmlLine(text: string): string {
		return highlightXmlLine(text ?? '');
	}

	public formatDateTime(value: string): string {
		if (!value) {
			return '';
		}

		return new Intl.DateTimeFormat('en', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	public formatDuration(durationMs: number | null): string {
		if (durationMs === null || durationMs === undefined) {
			return '';
		}

		const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}m ${seconds}s`;
	}

	public formatStatusState(status: RegistryStatus | JobStatus): 'Success' | 'Warning' | 'Error' | 'Information' | 'None' {
		switch (status) {
			case 'Published':
			case 'Completed':
				return 'Success';
			case 'Unpublished':
			case 'Queued':
				return 'Warning';
			case 'Archive':
			case 'Failed':
				return 'Error';
			case 'Running':
				return 'Information';
			default:
				return 'None';
		}
	}

	// ── AI Chat ──────────────────────────────────────────────────────────────

	/**
	 * Controllers that offer the AI chat override this to provide the XML context
	 * (e.g. the selected detail's metadata XML) the assistant should analyze.
	 */
	protected getAiChatContext(): AiChatContext | null {
		return null;
	}

	public onOpenAiChat(): void {
		const context = this.getAiChatContext();
		let model = this.getModel('aiChat') as JSONModel | undefined;
		if (!model) {
			model = new JSONModel({
				messages: [] as AiChatUiMessage[],
				input: '',
				busy: false,
				thinking: false,
				contextLabel: '',
				suggestions: [] as { text: string }[],
				models: [] as AiModelOption[],
				selectedModel: AI_MODEL_AUTO
			});
			this.setModel(model, 'aiChat');
		}
		model.setProperty('/models', this.aiChatService.getModelOptions());
		model.setProperty('/selectedModel', this.aiChatService.getPreferredModel());
		model.setProperty('/contextLabel', context?.label ?? '');
		model.setProperty('/suggestions', (context?.suggestions ?? DEFAULT_AI_SUGGESTIONS).map((text) => ({ text })));

		// Restore the conversation persisted for this context (per browser tab).
		this.aiChatStorageKey = context?.storageKey ?? null;
		const storedMessages = this.aiChatStorageKey
			? this.aiChatService.loadChatHistory<AiChatUiMessage>(this.aiChatStorageKey)
			: [];
		model.setProperty('/messages', storedMessages);
		if (storedMessages.length > 0) {
			this.scrollAiChatToBottom();
		}

		if (this.aiChatDialogPromise === null) {
			this.aiChatDialogPromise = Fragment.load({
				id: this.getView().getId(),
				name: 'com.zgp9.fe.view.fragments.AiChatDialog',
				controller: this
			}) as Promise<Dialog>;
		}

		void this.aiChatDialogPromise.then(
			(dialog) => {
				this.aiChatDialog = dialog;
				if (!dialog.getParent()) {
					this.getView().addDependent(dialog);
				}
				dialog.open();
			},
			(error: unknown) => {
				// Without this the rejected promise stays cached, so every later click is a
				// no-op too and the button just looks dead — which is how a 1.108-only
				// fragment error went unnoticed until it reached the launchpad.
				this.aiChatDialogPromise = null;
				MessageToast.show('The AI assistant could not be opened.');
				throw error;
			}
		);
	}

	public onAiChatClose(): void {
		this.aiChatDialog?.close();
	}

	public onAiChatAfterOpen(): void {
		this.focusAiChatInput();
	}

	private focusAiChatInput(): void {
		setTimeout(() => {
			(this.byId('aiChatInput') as { focus?: () => void } | null)?.focus?.();
		}, 100);
	}

	public onAiChatClear(): void {
		const model = this.getModel('aiChat') as JSONModel;
		model.setProperty('/messages', []);
		model.setProperty('/input', '');
		this.persistAiChat([]);
	}

	private persistAiChat(messages: AiChatUiMessage[]): void {
		if (this.aiChatStorageKey) {
			this.aiChatService.saveChatHistory(this.aiChatStorageKey, messages);
		}
	}

	public onAiModelChange(): void {
		const model = this.getModel('aiChat') as JSONModel;
		const selected = (model.getProperty('/selectedModel') as string) || AI_MODEL_AUTO;
		this.aiChatService.setPreferredModel(selected);
	}

	public onAiSuggestedPrompt(event: { getSource: () => { getText: () => string } }): void {
		const model = this.getModel('aiChat') as JSONModel;
		model.setProperty('/input', event.getSource().getText());
		void this.onAiChatSend();
	}

	public async onAiChatSend(): Promise<void> {
		const model = this.getModel('aiChat') as JSONModel;
		const input = ((model.getProperty('/input') as string) ?? '').trim();
		if (!input || (model.getProperty('/busy') as boolean)) {
			return;
		}

		const messages = [...(model.getProperty('/messages') as AiChatUiMessage[])];
		messages.push({ role: 'user', text: input, html: this.markdownToHtml(input) });

		// History is captured before the placeholder below so the empty
		// assistant message is never sent to the model.
		const history: AiChatMessage[] = messages
			.filter((message) => message.role !== 'error')
			.slice(-AI_CHAT_HISTORY_LIMIT)
			.map((message) => ({
				role: message.role === 'user' ? 'user' : 'assistant',
				content: message.text
			}));

		// Placeholder bubble that fills up as the answer streams in.
		messages.push({ role: 'assistant', text: '', html: '' });
		const assistantIndex = messages.length - 1;

		model.setProperty('/messages', messages);
		model.setProperty('/input', '');
		model.setProperty('/busy', true);
		model.setProperty('/thinking', true);
		this.scrollAiChatToBottom();

		let partialText = '';
		let lastRender = 0;
		try {
			const context = this.getAiChatContext();
			const systemPrompt = this.aiChatService.buildSystemPrompt(context?.label ?? 'No XML loaded', context?.xml ?? '');

			const answer = await this.aiChatService.askStream(
				[{ role: 'system', content: systemPrompt }, ...history],
				(fullText) => {
					partialText = fullText;
					model.setProperty('/thinking', false);
					// Re-rendering markdown on every token is wasteful; ~10 fps is plenty.
					const now = Date.now();
					if (now - lastRender < 100) {
						return;
					}
					lastRender = now;
					model.setProperty(`/messages/${assistantIndex}/html`, this.markdownToHtml(fullText));
					this.scrollAiChatToBottom(true);
				},
				(model.getProperty('/selectedModel') as string) || AI_MODEL_AUTO
			);
			messages[assistantIndex] = { role: 'assistant', text: answer, html: this.markdownToHtml(answer) };
		} catch (error) {
			const message = error instanceof Error ? error.message : JSON.stringify(error);
			const errorMessage: AiChatUiMessage = { role: 'error', text: message, html: this.markdownToHtml(message) };
			if (partialText) {
				// Keep whatever streamed before the failure and append the error.
				messages[assistantIndex] = { role: 'assistant', text: partialText, html: this.markdownToHtml(partialText) };
				messages.push(errorMessage);
			} else {
				messages[assistantIndex] = errorMessage;
			}
		} finally {
			model.setProperty('/messages', [...messages]);
			model.setProperty('/busy', false);
			model.setProperty('/thinking', false);
			this.persistAiChat(messages);
			this.scrollAiChatToBottom();
			this.focusAiChatInput();
		}
	}

	private scrollAiChatToBottom(immediate = false): void {
		const doScroll = () => {
			const scroll = this.byId('aiChatScroll') as ScrollContainer | null;
			scroll?.scrollTo(0, 999999, immediate ? 0 : 200);
		};
		if (immediate) {
			doScroll();
		} else {
			setTimeout(doScroll, 100);
		}
	}

	/**
	 * Minimal markdown -> HTML converter restricted to tags supported by
	 * sap.m.FormattedText. Input is escaped first, so model output cannot inject markup.
	 */
	private markdownToHtml(markdown: string): string {
		const escaped = markdown
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');

		// Fenced code blocks
		let html = escaped.replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, (_match, code: string) => `<pre><code>${code.replace(/\n$/, '')}</code></pre>`);

		// Inline code, bold, italic
		html = html
			.replace(/`([^`\n]+)`/g, '<code>$1</code>')
			.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
			.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

		// Bullet / numbered lists and tables (line based, outside of <pre> blocks)
		const lines = html.split('\n');
		const output: string[] = [];
		let listTag: 'ul' | 'ol' | null = null;
		let inPre = false;
		const tableBuffer: string[] = [];
		const closeList = () => {
			if (listTag) {
				output.push(`</${listTag}>`);
				listTag = null;
			}
		};
		const flushTable = () => {
			if (tableBuffer.length > 0) {
				output.push(this.renderMarkdownTable(tableBuffer));
				tableBuffer.length = 0;
			}
		};
		for (const line of lines) {
			if (line.includes('<pre>')) {
				inPre = true;
			}
			if (inPre) {
				flushTable();
				closeList();
				output.push(line);
				if (line.includes('</pre>')) {
					inPre = false;
				}
				continue;
			}

			// FormattedText cannot render <table>, so pipe tables become aligned monospace blocks.
			if (/^\s*\|.*\|\s*$/.test(line)) {
				closeList();
				tableBuffer.push(line);
				continue;
			}
			flushTable();

			const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
			const numberMatch = /^\s*\d+[.)]\s+(.*)$/.exec(line);
			if (bulletMatch || numberMatch) {
				const desiredTag = bulletMatch ? 'ul' : 'ol';
				if (listTag !== desiredTag) {
					closeList();
					output.push(`<${desiredTag}>`);
					listTag = desiredTag;
				}
				output.push(`<li>${(bulletMatch ?? numberMatch)[1]}</li>`);
			} else {
				closeList();
				output.push(line.length > 0 ? `${line}<br>` : '');
			}
		}
		flushTable();
		closeList();

		return output.join('\n');
	}

	/**
	 * Renders a markdown pipe table as a column-aligned monospace block,
	 * since sap.m.FormattedText does not support <table> markup.
	 */
	private renderMarkdownTable(lines: string[]): string {
		// Visible length: HTML entities from the earlier escaping count as one character.
		const visibleLength = (cell: string): number => cell.replace(/&(amp|lt|gt|quot);/g, 'x').length;

		const rows = lines
			.map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()))
			.filter((cells) => !(cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell))));

		if (rows.length === 0) {
			return '';
		}

		const columnWidths: number[] = [];
		for (const row of rows) {
			row.forEach((cell, index) => {
				columnWidths[index] = Math.max(columnWidths[index] ?? 0, visibleLength(cell));
			});
		}

		const rendered = rows
			.map((row) => row.map((cell, index) => cell + ' '.repeat(columnWidths[index] - visibleLength(cell))).join('  ').trimEnd())
			.join('\n');
		return `<pre><code>${rendered}</code></pre>`;
	}

	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Toggles the shell's side navigation.
	 *
	 * Lives here, not on MainShell, because the button was moved out of the shell header
	 * into each routed page's title bar (NavToggleButton.fragment.xml) — so the press is
	 * handled by whichever page controller is showing, not by the shell. Only the model is
	 * written; MainShell watches `/sideNavVisible` and applies the shell's CSS class.
	 */
	public onToggleSideNav(): void {
		const ui = this.getUiModel();
		const visible = !(ui.getProperty('/sideNavVisible') as boolean);
		ui.setProperty('/sideNavVisible', visible);
		writeSideNavPreference(visible);
	}

	public onNavBack(): void {
		const previousHash = History.getInstance().getPreviousHash();
		// If previous hash is undefined (direct link)
		if (previousHash !== undefined && previousHash !== '') {
			window.history.go(-1);
		} else {
			this.getRouter().navTo('home', {}, undefined, true);
		}
	}
}
