const SESSION_KEY = 'com.zgp9.fe.session';
const THEME_KEY = 'com.zgp9.fe.theme';
const SIDE_NAV_KEY = 'com.zgp9.fe.sideNavVisible';

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

export function readThemePreference(): string | null {
	if (!isBrowserStorageAvailable()) {
		return null;
	}

	return window.localStorage.getItem(THEME_KEY);
}

export function writeThemePreference(theme: string): void {
	if (!isBrowserStorageAvailable()) {
		return;
	}

	window.localStorage.setItem(THEME_KEY, theme);
}

export function readSideNavPreference(): boolean {
	if (!isBrowserStorageAvailable()) {
		return true;
	}

	return window.localStorage.getItem(SIDE_NAV_KEY) !== '0';
}

export function writeSideNavPreference(visible: boolean): void {
	if (!isBrowserStorageAvailable()) {
		return;
	}

	window.localStorage.setItem(SIDE_NAV_KEY, visible ? '1' : '0');
}
