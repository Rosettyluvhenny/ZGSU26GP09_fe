import ServiceError from './ServiceError';

export interface AiChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface AiModelRef {
	id: string;
	label: string;
}

interface AiProvider {
	name: string;
	/**
	 * Path *below* the host's AI base — not the provider's own URL, and not a complete
	 * path. See resolveAiBasePath and the comment on PROVIDERS.
	 */
	path: string;
	models: AiModelRef[];
}

interface AiModelCandidate {
	provider: AiProvider;
	model: AiModelRef;
}

export interface AiModelOption {
	key: string;
	text: string;
}

export const AI_MODEL_AUTO = 'auto';

const MODEL_STORAGE_KEY = 'com.zgp9.fe.aiChat.selectedModel';
const CHAT_STORAGE_PREFIX = 'com.zgp9.fe.aiChat.';

/**
 * Base path for the AI routes on the host currently serving the app.
 *
 * These are never the provider's own URL. Whichever host serves the app puts a component
 * in front of the provider that attaches the API key server-side, so no key is ever
 * shipped to or held by the browser:
 *
 * | Host                        | Base                  | Key injected by                        |
 * | --------------------------- | --------------------- | -------------------------------------- |
 * | BTP approuter               | `/ai/`                | AI_GROQ / AI_OPENROUTER destinations    |
 * | local `npm start`           | `/ai/`                | ui5-middleware-sap-proxy, from `.env`   |
 * | ABAP — standalone *and* FLP | `/sap/bc/zgp9_ai/`    | the Z ICF handler, from its SM59 dest.  |
 *
 * Keyed off paths rather than the hostname: hostnames move, and deferred finding D is a
 * live example of a pinned URL breaking when a route changes. `/sap/bc/` is the ICF runtime
 * path and exists only on an ABAP host.
 *
 * ⚠️ **`toUrl` must be resolved before it is tested, and the two clauses below are not
 * redundant.** Both facts cost a deploy cycle to learn; do not simplify this to one check.
 *
 *  - `toUrl('com/zgp9/fe/')` returns whatever the resource root was *registered* as, which
 *    is not always absolute. `index.html` registers `resourceroots` as `"./"`, so on the
 *    ABAP standalone URL and on BTP alike it returns the relative `./` — with no path in it
 *    to match. An earlier version tested that string directly and therefore never took the
 *    ABAP branch on the standalone URL. Resolving against `document.baseURI` fixes it:
 *    a relative root resolves against the page, an absolute one is left alone.
 *  - Under FLP the resource root *is* absolute (the shell registers it from the app index,
 *    since the launchpad page and the app live at different paths), so the first clause
 *    normally catches the embedded case. The `location` clause is the backstop for it —
 *    the FLP page itself is `/sap/bc/ui2/flp`, which is the same ABAP host by definition.
 *    Neither clause alone covers both entry points reliably.
 */
const AI_BASE_APPROUTER = '/ai/';
/** Must match the SICF node created for the handler. Change both together. */
const AI_BASE_ABAP = '/sap/bc/zgp9_ai/';

const isAbapHost = (): boolean => {
	const resourceRoot = new URL(sap.ui.require.toUrl('com/zgp9/fe/'), document.baseURI).pathname;
	return resourceRoot.includes('/sap/bc/ui5_ui5/') || window.location.pathname.startsWith('/sap/bc/');
};

export const resolveAiBasePath = (): string => (isAbapHost() ? AI_BASE_ABAP : AI_BASE_APPROUTER);

// Providers are tried in order; within a provider, models are tried in order. When one
// is rate-limited/unavailable the next is used, so exhausting one provider's daily
// quota rolls over to the next. All are OpenAI-compatible.
const PROVIDERS: AiProvider[] = [
	{
		name: 'Groq',
		path: 'groq/chat/completions',
		models: [
			{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
			{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
			{ id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' }
		]
	},
	{
		name: 'OpenRouter',
		path: 'openrouter/chat/completions',
		// Replaced 2026-07-28. The previous three slugs had rotted: OpenRouter answered
		// "This model is unavailable for free" for meta-llama/llama-3.3-70b-instruct:free,
		// and deepseek-chat-v3-0324:free had left the catalogue. Free-tier slugs churn, and
		// this list is only reached when Groq is rate-limited — so a dead entry here stays
		// invisible until the exact moment the fallback is needed. If the AI chat ever fails
		// only under load, re-check these first.
		models: [
			{ id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B' },
			{ id: 'inclusionai/ling-3.0-flash:free', label: 'Ling 3.0 Flash' }
		]
	}
];

const candidateKey = (candidate: AiModelCandidate): string => `${candidate.provider.name}::${candidate.model.id}`;

// Keep the XML context within a size the free models can comfortably handle.
const MAX_XML_CONTEXT_CHARS = 40000;

interface OpenRouterResponse {
	choices?: { message?: { content?: string } }[];
	error?: { message?: string; code?: number };
}

export default class AiChatService {
	/** Options for the model picker: "Auto" plus every configured provider/model pair. */
	public getModelOptions(): AiModelOption[] {
		const options: AiModelOption[] = [{ key: AI_MODEL_AUTO, text: 'Auto (best available)' }];
		for (const provider of PROVIDERS) {
			for (const model of provider.models) {
				options.push({
					key: candidateKey({ provider, model }),
					text: `${model.label} (${provider.name})`
				});
			}
		}
		return options;
	}

	public getPreferredModel(): string {
		try {
			const stored = window.localStorage.getItem(MODEL_STORAGE_KEY) || AI_MODEL_AUTO;
			// A stored choice may reference a provider whose key was removed since.
			return this.getModelOptions().some((option) => option.key === stored) ? stored : AI_MODEL_AUTO;
		} catch {
			return AI_MODEL_AUTO;
		}
	}

	public setPreferredModel(key: string): void {
		try {
			window.localStorage.setItem(MODEL_STORAGE_KEY, key);
		} catch {
			// Storage unavailable; the choice just won't survive a reload.
		}
	}

	/**
	 * Chat histories live in sessionStorage (per browser tab), keyed by what is
	 * being analyzed, so navigating away and back keeps the conversation.
	 */
	public loadChatHistory<T>(key: string): T[] {
		try {
			const raw = window.sessionStorage.getItem(CHAT_STORAGE_PREFIX + key);
			const parsed = raw ? (JSON.parse(raw) as unknown) : null;
			return Array.isArray(parsed) ? (parsed as T[]) : [];
		} catch {
			return [];
		}
	}

	public saveChatHistory<T>(key: string, messages: T[]): void {
		try {
			if (messages.length === 0) {
				window.sessionStorage.removeItem(CHAT_STORAGE_PREFIX + key);
			} else {
				window.sessionStorage.setItem(CHAT_STORAGE_PREFIX + key, JSON.stringify(messages));
			}
		} catch {
			// Quota exceeded or private mode; the chat just won't be restored.
		}
	}

	public buildSystemPrompt(contextLabel: string, xml: string): string {
		let xmlContext = xml || '';
		if (xmlContext.length > MAX_XML_CONTEXT_CHARS) {
			xmlContext = xmlContext.slice(0, MAX_XML_CONTEXT_CHARS) + '\n<!-- ... XML truncated for length ... -->';
		}

		return (
			'You are an assistant embedded in an SAP OData Service Registry application. ' +
			'You help developers understand OData $metadata XML documents (EDMX): entity types, entity sets, ' +
			'properties, keys, navigation properties, associations, annotations, actions and functions.\n\n' +
			'Answer concisely. Use simple markdown only (bold, inline code, bullet lists, short code blocks). ' +
			'Never use markdown tables — use bullet lists instead, e.g. "- **Currency** — key: CurrencyCode". ' +
			'When the user asks something unrelated to the XML, still answer helpfully but briefly.\n\n' +
			`Current context: ${contextLabel}\n\n` +
			'XML under analysis:\n```xml\n' + xmlContext + '\n```'
		);
	}

	public async ask(messages: AiChatMessage[]): Promise<string> {
		return this.askStream(messages, () => undefined);
	}

	/**
	 * Streams the answer; onDelta receives the full text accumulated so far
	 * every time a new chunk arrives. Resolves with the complete answer.
	 * preferredModel (a key from getModelOptions) is tried first; the rest of
	 * the chain still acts as fallback when it fails.
	 */
	public async askStream(messages: AiChatMessage[], onDelta: (fullText: string) => void, preferredModel: string = AI_MODEL_AUTO): Promise<string> {
		const candidates: AiModelCandidate[] = PROVIDERS.flatMap((provider) => provider.models.map((model) => ({ provider, model })));
		if (preferredModel !== AI_MODEL_AUTO) {
			const preferredIndex = candidates.findIndex((candidate) => candidateKey(candidate) === preferredModel);
			if (preferredIndex > 0) {
				candidates.unshift(candidates.splice(preferredIndex, 1)[0]);
			}
		}

		let lastError: ServiceError | null = null;
		for (const candidate of candidates) {
			let started = false;
			try {
				return await this.callModelStream(candidate.provider, candidate.model.id, messages, (fullText) => {
					started = true;
					onDelta(fullText);
				});
			} catch (error) {
				lastError = error instanceof ServiceError ? error : new ServiceError(0, error instanceof Error ? error.message : JSON.stringify(error));
				// If the stream already produced output, don't restart with another
				// model or the user would see the answer reset mid-sentence.
				if (started) {
					throw lastError;
				}
				// 401/403 now come from the approuter rather than the AI provider, so
				// they are an app-level auth problem that every route shares — trying
				// the remaining candidates would just repeat the same failure.
				if (lastError.status === 401 || lastError.status === 403) {
					throw lastError;
				}
			}
		}

		throw lastError ?? new ServiceError(0, 'All free AI models are currently unavailable.');
	}

	private async callModelStream(provider: AiProvider, model: string, messages: AiChatMessage[], onDelta: (fullText: string) => void): Promise<string> {
		const response = await fetch(resolveAiBasePath() + provider.path, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			// Same-origin on every host — the approuter on BTP, the ICF handler on ABAP. The
			// session cookie is what authenticates the call, and the server side attaches the
			// provider key on the way out. Staying same-origin is deliberate: calling the BTP
			// approuter cross-origin from ABAP would need CORS plus a second session, and its
			// xsuaa routes answer an unauthenticated fetch with a login redirect it cannot follow.
			credentials: 'same-origin',
			body: JSON.stringify({
				model,
				messages,
				stream: true
			})
		});

		if (!response.ok) {
			let message = `AI request failed (${response.status})`;
			try {
				const errorBody = (await response.json()) as OpenRouterResponse;
				if (errorBody.error?.message) {
					message = errorBody.error.message;
				}
			} catch {
				// Keep the generic message.
			}
			if (response.status === 401) {
				message = 'Your session has expired. Reload the page and sign in again.';
			} else if (response.status === 403) {
				message = 'The AI assistant is currently unavailable. Please try again later or contact an administrator.';
			} else if (response.status === 429) {
				message = `${provider.name} free-tier quota reached. Wait a moment and try again.`;
			}
			throw new ServiceError(response.status, message);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new ServiceError(502, 'Streaming is not supported by this browser.');
		}

		const decoder = new TextDecoder();
		let buffer = '';
		let fullText = '';

		// OpenAI-compatible SSE stream: lines of "data: {json}" ending with "data: [DONE]".
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });

			let newlineIndex = buffer.indexOf('\n');
			while (newlineIndex >= 0) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);
				newlineIndex = buffer.indexOf('\n');

				if (!line.startsWith('data:')) {
					continue;
				}
				const payload = line.slice(5).trim();
				if (!payload || payload === '[DONE]') {
					continue;
				}
				try {
					const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
					if (chunk.error?.message) {
						throw new ServiceError(502, chunk.error.message);
					}
					const delta = chunk.choices?.[0]?.delta?.content;
					if (delta) {
						fullText += delta;
						onDelta(fullText);
					}
				} catch (error) {
					if (error instanceof ServiceError) {
						throw error;
					}
					// Ignore malformed keep-alive/comment lines.
				}
			}
		}

		const trimmed = fullText.trim();
		if (!trimmed) {
			throw new ServiceError(502, `Model ${model} returned an empty response.`);
		}
		return trimmed;
	}
}
