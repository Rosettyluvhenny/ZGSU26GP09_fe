import ServiceError from './ServiceError';
import { readSessionStorage, removeSessionStorage, writeSessionStorage } from './SessionStorage';
import type { SessionData } from '../model/types';
import ODataClient from './ODataClient';

const EMPTY_SESSION: SessionData = {
	authenticated: false,
	userName: '',
	csrfToken: '',
	loginAt: null
};

const PROXY_LOGOFF_URL = '/sap/public/bc/icf/logoff?sap-client=324';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}

function clearBrowserCookies(): void {
	if (typeof document === 'undefined') {
		return;
	}

	const names = document.cookie
		.split(';')
		.map((cookie) => cookie.split('=')[0]?.trim())
		.filter((name): name is string => Boolean(name));

	const currentPath = window.location.pathname || '/';
	for (const name of names) {
		const encodedName = encodeURIComponent(name);
		const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
		document.cookie = `${encodedName}=; expires=${expires}; path=/`;
		document.cookie = `${encodedName}=; expires=${expires}; path=${currentPath}`;
	}
}

export default class AuthenticationService {
	public async getSession(): Promise<SessionData> {
		return delay(readSessionStorage(EMPTY_SESSION), 50);
	}

	public async login(userName: string, password: string): Promise<SessionData> {
		if (!userName || !password) {
			throw new ServiceError(401, 'Username and password are required.');
		}

		const authorization = `Basic ${btoa(`${userName.trim()}:${password}`)}`;
		const response = await fetch('/auth/login', {
			method: 'POST',
			headers: {
				Authorization: authorization,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				userName: userName.trim()
			})
		});

		if (!response.ok) {
			throw new ServiceError(401, 'Invalid username or password.');
		}

		const payload = (await response.json()) as {
			authenticated?: boolean;
			userName?: string;
			csrfToken?: string;
			eTag?: string;
		};
		const session: SessionData = {
			authenticated: Boolean(payload.authenticated),
			userName: payload.userName || userName.trim(),
			csrfToken: payload.csrfToken || '',
			loginAt: new Date().toISOString()
		};
		writeSessionStorage(session);

		if (payload.csrfToken) {
			ODataClient.setSecurityState(payload.csrfToken, payload.eTag);
		}

		return delay(session);
	}

	public async fetchCsrfToken(): Promise<string> {
		const session = readSessionStorage(EMPTY_SESSION);
		if (!session.authenticated) {
			throw new ServiceError(401, 'Session expired.');
		}

		return ODataClient.checkAuthAndFetchCsrf();
	}

	public async logout(): Promise<void> {
		try {
			await fetch(PROXY_LOGOFF_URL, {
				method: 'GET',
				credentials: 'include',
				redirect: 'manual',
				cache: 'no-store',
				headers: {
					Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
				}
			});
		} catch {
			// Ignore redirect/network failures and finish local cleanup.
		}

		ODataClient.clearSecurityState();
		removeSessionStorage();
		clearBrowserCookies();
		await delay(undefined, 50);
	}
}
