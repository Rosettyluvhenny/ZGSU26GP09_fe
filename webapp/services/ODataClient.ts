import ServiceError from './ServiceError';

export const SERVICE_ORIGIN = '/sap/opu/odata4/sap/zsb_gsugp9/srvd_a2x/sap/zsr_registry/0001';
export const SERVICE_BASE_URL = `${SERVICE_ORIGIN}?sap-client=324`;
export const SERVICE_METADATA_URL = `${SERVICE_ORIGIN}/$metadata?sap-client=324`;
export const LOGOFF_URL = 'https://s40lp1.ucc.cit.tum.de:8100/sap/public/bc/icf/logoff?sap-client=324';

const DEFAULT_QUERY = { 'sap-client': '324' };

type ODataQueryValue = string | number | boolean | null | undefined;

export type ODataWriteMethod = 'POST' | 'PATCH' | 'DELETE';
export interface ODataRequestOptions {
	query?: Record<string, ODataQueryValue>;
	headers?: Record<string, string>;
}

export default class ODataClient {
	private csrfToken = '';
	private etag = '*';

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
			headers: {
				Accept: 'application/json',
				...options.headers
			}
		});

		if (!response.ok) {
			throw new Error(`GET ${path} failed (${response.status})`);
		}

		return response.json();
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
			throw new Error(`GET ${path} failed (${response.status})`);
		}

		return response.text();
	}

	private async requestWriteJson(path: string, method: ODataWriteMethod, body?: unknown, options: ODataRequestOptions = {}): Promise<unknown> {
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
			throw new Error(`${method} ${path} failed (${response.status})`);
		}

		return response.json();
	}

	public async authenticate(userName: string, password: string): Promise<string> {
		const authorization = `Basic ${btoa(`${userName}:${password}`)}`;
		const response = await fetch(this.buildUrl(SERVICE_ORIGIN), {
			method: 'GET',
			credentials: 'include',
			headers: {
				Accept: 'application/json',
				Authorization: authorization,
				'X-CSRF-Token': 'Fetch'
			}
		});

		if (!response.ok) {
			throw new Error(`Authentication failed (${response.status})`);
		}

		const token = response.headers.get('x-csrf-token') ?? response.headers.get('X-CSRF-Token') ?? '';
		const etag = response.headers.get('etag');
		this.csrfToken = token || this.csrfToken;
		if (etag) {
			this.etag = etag;
		}
		return this.csrfToken;
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
		const response = await fetch(SERVICE_BASE_URL, {
			method: 'GET',
			credentials: 'include',
			headers: {
				Accept: 'application/json',
				'X-CSRF-Token': 'Fetch'
			}
		});

		if (!response.ok) {
			throw new ServiceError(response.status, `CSRF token refresh failed (${response.status})`);
		}

		const token = response.headers.get('x-csrf-token') ?? response.headers.get('X-CSRF-Token') ?? '';
		const etag = response.headers.get('etag');
		if (token) {
			this.csrfToken = token;
		}
		if (etag) {
			this.etag = etag;
		}
		return this.csrfToken;
	}

	public clearSecurityState(): void {
		this.csrfToken = '';
		this.etag = '*';
	}

	public async fetchCsrfToken(): Promise<string> {
		if (this.csrfToken) {
			return this.csrfToken;
		}

		try {
			return await this.refreshCsrfToken();
		} catch {
			if (!this.csrfToken) {
				this.csrfToken = `offline-${Date.now().toString(36)}`;
			}
			return this.csrfToken;
		}
	}

	public async ensureWriteHeaders(method: ODataWriteMethod, etag?: string): Promise<Record<string, string>> {
		const csrfToken = await this.fetchCsrfToken();
		const headers: Record<string, string> = {
			'X-CSRF-Token': csrfToken
		};

		if (method === 'PATCH' || method === 'DELETE') {
			headers['If-Match'] = etag ?? this.etag ?? '*';
		}

		return headers;
	}
}
