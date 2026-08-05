import { readSessionStorage } from './SessionStorage';
import type { sessionData } from '../model/types';
import ODataClient from './ODataClient';

const EMPTY_SESSION: sessionData = {
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
	constructor(private readonly model?: import("sap/ui/model/odata/v4/ODataModel").default) {}
	public async getSession(): Promise<sessionData> {
		return delay(readSessionStorage(EMPTY_SESSION), 50);
	}

	public async fetchCsrfToken(): Promise<string> {
		return ODataClient.refreshCsrfToken();
	}
}


