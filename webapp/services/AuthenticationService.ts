import ServiceError from './ServiceError';
import { readSessionStorage, removeSessionStorage, writeSessionStorage } from './MockStore';
import type { SessionData } from '../model/types';

const EMPTY_SESSION: SessionData = {
	authenticated: false,
	userName: '',
	csrfToken: '',
	loginAt: null
};

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
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
		return delay(session);
	}

	public async fetchCsrfToken(): Promise<string> {
		const session = readSessionStorage(EMPTY_SESSION);
		if (!session.authenticated) {
			throw new ServiceError(401, 'Session expired.');
		}

		if (session.csrfToken) {
			return delay(session.csrfToken, 50);
		}

		const nextSession: SessionData = {
			...session,
			csrfToken: `offline-${Date.now().toString(36)}`
		};
		writeSessionStorage(nextSession);
		return delay(nextSession.csrfToken, 50);
	}

	public async logout(): Promise<void> {
		removeSessionStorage();
		await delay(undefined, 50);
	}
}
