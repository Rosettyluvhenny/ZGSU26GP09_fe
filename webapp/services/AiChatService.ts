import ServiceError from './ServiceError';
import { GROQ_API_KEY, OPENROUTER_API_KEY } from './AiKey';

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
	url: string;
	apiKey: string;
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

const API_KEY_STORAGE_KEY = 'com.zgp9.fe.openrouter.apiKey';
const MODEL_STORAGE_KEY = 'com.zgp9.fe.aiChat.selectedModel';
const CHAT_STORAGE_PREFIX = 'com.zgp9.fe.aiChat.';

// The keys live in the git-ignored AiKey.ts (see AiKey.example.ts).
const DEFAULT_API_KEY = OPENROUTER_API_KEY;

// Providers are tried in order; within a provider, models are tried in order.
// When one is rate-limited/unavailable the next is used, so exhausting one
// provider's daily quota rolls over to the next. All are OpenAI-compatible.
const buildProviders = (openRouterKey: string): AiProvider[] =>
	[
		{
			name: 'Groq',
			url: 'https://api.groq.com/openai/v1/chat/completions',
			apiKey: GROQ_API_KEY,
			models: [
				{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
				{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
				{ id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' }
			]
		},
		{
			name: 'OpenRouter',
			url: 'https://openrouter.ai/api/v1/chat/completions',
			apiKey: openRouterKey,
			models: [
				{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra' },
				{ id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3' },
				{ id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' }
			]
		}
	].filter((provider) => provider.apiKey.length > 0);

const candidateKey = (candidate: AiModelCandidate): string => `${candidate.provider.name}::${candidate.model.id}`;

// Keep the XML context within a size the free models can comfortably handle.
const MAX_XML_CONTEXT_CHARS = 40000;

interface OpenRouterResponse {
	choices?: { message?: { content?: string } }[];
	error?: { message?: string; code?: number };
}

export default class AiChatService {
	public getApiKey(): string {
		try {
			return window.localStorage.getItem(API_KEY_STORAGE_KEY) || DEFAULT_API_KEY;
		} catch {
			return DEFAULT_API_KEY;
		}
	}

	public setApiKey(apiKey: string): void {
		try {
			window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
		} catch {
			// Storage unavailable (private mode); the key just won't survive a reload.
		}
	}

	public hasApiKey(): boolean {
		return buildProviders(this.getApiKey()).length > 0;
	}

	/** Options for the model picker: "Auto" plus every configured provider/model pair. */
	public getModelOptions(): AiModelOption[] {
		const options: AiModelOption[] = [{ key: AI_MODEL_AUTO, text: 'Auto (best available)' }];
		for (const provider of buildProviders(this.getApiKey())) {
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
		const providers = buildProviders(this.getApiKey());
		if (providers.length === 0) {
			throw new ServiceError(401, 'No AI API key configured. Get a free key at https://openrouter.ai/keys.');
		}

		const candidates: AiModelCandidate[] = providers.flatMap((provider) => provider.models.map((model) => ({ provider, model })));
		if (preferredModel !== AI_MODEL_AUTO) {
			const preferredIndex = candidates.findIndex((candidate) => candidateKey(candidate) === preferredModel);
			if (preferredIndex > 0) {
				candidates.unshift(candidates.splice(preferredIndex, 1)[0]);
			}
		}

		let lastError: ServiceError | null = null;
		const skipProviders = new Set<string>();
		for (const candidate of candidates) {
			if (skipProviders.has(candidate.provider.name)) {
				continue;
			}
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
				// 401/403 means this provider's key is bad -> its other models
				// won't help, but the next provider still might.
				if (lastError.status === 401 || lastError.status === 403) {
					skipProviders.add(candidate.provider.name);
				}
			}
		}

		throw lastError ?? new ServiceError(0, 'All free AI models are currently unavailable.');
	}

	private async callModelStream(provider: AiProvider, model: string, messages: AiChatMessage[], onDelta: (fullText: string) => void): Promise<string> {
		const response = await fetch(provider.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${provider.apiKey}`
			},
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
			if (response.status === 429) {
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
