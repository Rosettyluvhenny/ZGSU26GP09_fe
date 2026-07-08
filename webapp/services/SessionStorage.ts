const SESSION_KEY = 'com.zgp9.fe.session';

function isBrowserStorageAvailable(): boolean {
	return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function readSessionStorage<T>(fallback: T): T {
	if (!isBrowserStorageAvailable()) {
		return fallback;
	}

	const raw = window.localStorage.getItem(SESSION_KEY);
	if (!raw) {
		return fallback;
	}

	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export function writeSessionStorage<T>(value: T): void {
	if (!isBrowserStorageAvailable()) {
		return;
	}

	window.localStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

export function removeSessionStorage(): void {
	if (!isBrowserStorageAvailable()) {
		return;
	}

	window.localStorage.removeItem(SESSION_KEY);
}
