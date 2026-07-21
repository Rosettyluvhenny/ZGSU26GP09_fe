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



function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}



export default class AuthenticationService {
	public async getSession(): Promise<SessionData> {
		return delay(readSessionStorage(EMPTY_SESSION), 50);
	}


	public async fetchCsrfToken(): Promise<string> {
		return ODataClient.refreshCsrfToken();
	}
}
