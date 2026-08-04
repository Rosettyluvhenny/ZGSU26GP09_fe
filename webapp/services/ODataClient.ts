import ServiceError from './ServiceError';

export const SERVICE_ORIGIN = '/sap/opu/odata4/sap/zsb_gsugp9/srvd_a2x/sap/zsr_registry/0001';
export const SERVICE_BASE_URL = `${SERVICE_ORIGIN}/`;
export const SERVICE_METADATA_URL = `${SERVICE_ORIGIN}/$metadata`;

type ODataQueryValue = string | number | boolean | null | undefined;

export const DEFAULT_QUERY: Record<string, ODataQueryValue> = {};

export type ODataWriteMethod = 'POST' | 'PATCH' | 'DELETE';
export interface ODataRequestOptions {
	query?: Record<string, ODataQueryValue>;
	headers?: Record<string, string>;
}

export default class ODataClient {
	constructor(private readonly model?: import('sap/ui/model/odata/v4/ODataModel').default) {}
	private static csrfToken = '';
	private static etag = '*';
	private static authPromise: Promise<string> | null = null;

	public static setSecurityState(csrfToken: string, etag?: string): void {
		if (csrfToken) ODataClient.csrfToken = csrfToken;
		if (etag) ODataClient.etag = etag;
	}

	public static clearSecurityState(): void {
		ODataClient.csrfToken = '';
		ODataClient.etag = '*';
		ODataClient.authPromise = null;
	}

	public static async refreshCsrfToken(): Promise<string> {
		if (ODataClient.authPromise !== null) {
			return ODataClient.authPromise;
		}

		ODataClient.authPromise = (async () => {
			const response = await fetch(SERVICE_BASE_URL, {
				method: 'GET',
				credentials: 'include',
				headers: {
					Accept: 'application/json',
					'X-CSRF-Token': 'Fetch'
				}
			});

			if (!response.ok) {
				ODataClient.authPromise = null;
				throw new ServiceError(response.status, `CSRF fetch failed (${response.status})`);
			}

			const token = response.headers.get('x-csrf-token') ?? response.headers.get('X-CSRF-Token') ?? '';
			const etag = response.headers.get('etag');
			ODataClient.setSecurityState(token, etag || undefined);
			return ODataClient.csrfToken;
		})();

		try {
			await ODataClient.authPromise;
		} catch (error) {
			ODataClient.authPromise = null;
			throw error;
		}

		return ODataClient.authPromise;
	}

	public static async ensureAuth(): Promise<void> {
		if (ODataClient.csrfToken) {
			return;
		}
		await ODataClient.refreshCsrfToken();
	}

	private buildUrl(path: string, query?: Record<string, ODataQueryValue>): string {
		const normalizedPath = path.startsWith('http://') || path.startsWith('https://') || path.startsWith(SERVICE_ORIGIN)
			? path
			: `${SERVICE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
		const url = new URL(normalizedPath, window.location.origin);
		const mergedQuery = { ...DEFAULT_QUERY, ...(query ?? {}) };
		for (const [key, value] of Object.entries(mergedQuery)) {
			if (value === null || value === undefined || value === '') {
				continue;
			}
			url.searchParams.set(key, String(value));
		}

		return url.toString();
	}

	private async requestJson(path: string, options: ODataRequestOptions = {}): Promise<unknown> {
		const response = await fetch(this.buildUrl(path, options.query), {
			method: 'GET',
			credentials: 'include',
			cache: 'no-store',
			headers: {
				Accept: 'application/json',
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache',
				...options.headers
			}
		});

		if (!response.ok) {
			throw new ServiceError(response.status, `GET ${path} failed (${response.status})`);
		}

		const text = await response.text();
		if (!text) {
			return {};
		}

		try {
			return JSON.parse(text);
		} catch {
			return {};
		}
	}

	private async requestText(path: string, options: ODataRequestOptions = {}): Promise<string> {
		const response = await fetch(this.buildUrl(path, options.query), {
			method: 'GET',
			credentials: 'include',
			headers: {
				Accept: 'application/xml, text/xml, application/json',
				...options.headers
			}
		});

		if (!response.ok) {
			throw new ServiceError(response.status, `GET ${path} failed (${response.status})`);
		}

		return response.text();
	}

	private async requestWriteJson(path: string, method: ODataWriteMethod, body?: unknown, options: ODataRequestOptions = {}): Promise<unknown> {
		await ODataClient.ensureAuth();
		const response = await fetch(this.buildUrl(path, options.query), {
			method,
			credentials: 'include',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				...options.headers
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});

		if (!response.ok) {
			// Try to extract the ABAP/OData error message from the response body
			let detail = '';
			try {
				const errText = await response.text();
				const errJson = JSON.parse(errText) as Record<string, unknown>;
				const errObj = errJson['error'] as Record<string, unknown> | undefined;
				if (errObj) {
					const msg = errObj['message'];
					if (typeof msg === 'string') {
						detail = msg;
				} else if (msg && typeof msg === 'object') {
					const val = (msg as Record<string, unknown>)['value'];
					detail = typeof val === 'string' ? val : '';
				}
				}
			} catch {
				// ignore parse errors â€” fall back to generic message
			}
			const message = detail
				? `${method} ${path} failed (${response.status}): ${detail}`
				: `${method} ${path} failed (${response.status})`;
			throw new ServiceError(response.status, message);
		}

		const text = await response.text();
		if (!text) {
			return {};
		}

		try {
			return JSON.parse(text);
		} catch {
			return {};
		}
	}

	public async readJson(path: string, options: ODataRequestOptions = {}): Promise<unknown> {
		return this.requestJson(path, options);
	}

	public async readText(path: string, options: ODataRequestOptions = {}): Promise<string> {
		return this.requestText(path, options);
	}

	public async postJson(path: string, body?: unknown, options: ODataRequestOptions = {}): Promise<unknown> {
		return this.requestWriteJson(path, 'POST', body, options);
	}

	public async refreshCsrfToken(): Promise<string> {
		return ODataClient.refreshCsrfToken();
	}

	public clearSecurityState(): void {
		ODataClient.clearSecurityState();
	}

	public async fetchCsrfToken(): Promise<string> {
		if (ODataClient.csrfToken) {
			return ODataClient.csrfToken;
		}

		if (this.model) {
			try {
				await this.model.getMetaModel().requestObject('/');
			} catch (e) {
				// Ignore errors from metamodel
			}
		}

		return await this.refreshCsrfToken();
	}

	public async ensureWriteHeaders(method: ODataWriteMethod, etag?: string): Promise<Record<string, string>> {
		const csrfToken = await this.fetchCsrfToken();
		const headers: Record<string, string> = {
			'X-CSRF-Token': csrfToken
		};

		if (method === 'PATCH' || method === 'DELETE') {
			headers['If-Match'] = etag ?? ODataClient.etag ?? '*';
		}

		return headers;
	}
}

