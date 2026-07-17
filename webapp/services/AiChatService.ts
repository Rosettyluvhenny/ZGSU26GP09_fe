import ServiceError from './ServiceError';
import { OPENROUTER_API_KEY } from './AiKey';

export interface AiChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY_STORAGE_KEY = 'com.zgp9.fe.openrouter.apiKey';

// The key lives in the git-ignored AiKey.ts (see AiKey.example.ts).
const DEFAULT_API_KEY = OPENROUTER_API_KEY;

// Free models tried in order; when one is rate-limited/unavailable the next is used.
const FREE_MODELS = [
	'nvidia/nemotron-3-ultra-550b-a55b:free',
	'deepseek/deepseek-chat-v3-0324:free',
	'meta-llama/llama-3.3-70b-instruct:free'
];

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
		return this.getApiKey().length > 0;
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
			'When the user asks something unrelated to the XML, still answer helpfully but briefly.\n\n' +
			`Current context: ${contextLabel}\n\n` +
			'XML under analysis:\n```xml\n' + xmlContext + '\n```'
		);
	}

	public async ask(messages: AiChatMessage[]): Promise<string> {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			throw new ServiceError(401, 'No OpenRouter API key configured. Get a free key at https://openrouter.ai/keys.');
		}

		let lastError: ServiceError | null = null;
		for (const model of FREE_MODELS) {
			try {
				return await this.callModel(model, messages, apiKey);
			} catch (error) {
				lastError = error instanceof ServiceError ? error : new ServiceError(0, error instanceof Error ? error.message : JSON.stringify(error));
				// 401/403 means a bad key -> retrying other models won't help.
				if (lastError.status === 401 || lastError.status === 403) {
					throw lastError;
				}
			}
		}

		throw lastError ?? new ServiceError(0, 'All free AI models are currently unavailable.');
	}

	private async callModel(model: string, messages: AiChatMessage[], apiKey: string): Promise<string> {
		const response = await fetch(API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model,
				messages
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
			throw new ServiceError(response.status, message);
		}

		const data = (await response.json()) as OpenRouterResponse;
		const content = data.choices?.[0]?.message?.content?.trim();
		if (!content) {
			throw new ServiceError(502, `Model ${model} returned an empty response.`);
		}
		return content;
	}
}
