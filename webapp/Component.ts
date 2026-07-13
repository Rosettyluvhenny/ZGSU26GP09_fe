import UIComponent from 'sap/ui/core/UIComponent';
import Device from 'sap/ui/Device';
import * as Messaging from 'sap/ui/core/Messaging';
import Theming from 'sap/ui/core/Theming';
import JSONModel from 'sap/ui/model/json/JSONModel';
import type { Router$BeforeRouteMatchedEvent } from 'sap/ui/core/routing/Router';
import MessageModel from 'sap/ui/model/message/MessageModel';

import { readThemePreference, writeSessionStorage } from './services/SessionStorage';
import type { SessionData } from './model/types';

import AuthenticationService from './services/AuthenticationService';
import DetailService from './services/DetailService';
import ErrorHandler from './services/ErrorHandler';
import JobService from './services/JobService';
import LogService from './services/LogService';
import ODataClient from './services/ODataClient';
import RegistryService from './services/RegistryService';
import VersionService from './services/VersionService';
import models from './model/models';

/**
 * @namespace com.zgp9.fe
 */
export default class Component extends UIComponent {
	public static metadata = {
		manifest: 'json',
		interfaces: ['sap.ui.core.IAsyncContentCreation']
	};

	private readonly authenticationService = new AuthenticationService();
	private readonly detailService = new DetailService();
	private readonly registryService = new RegistryService();
	private readonly versionService = new VersionService(this.detailService);
	private readonly jobService = new JobService();
	private readonly logService = new LogService();
	private errorHandler!: ErrorHandler;
	private contentDensityClass: string;

	public init(): void {
		super.init();

		this.applyStoredTheme();
		this.setModel(models.createDeviceModel(), 'device');
		this.setModel(models.createSessionModel(), 'session');
		this.setModel(models.createUiModel(), 'ui');
		this.setModel((Messaging as unknown as { getMessageModel: () => MessageModel }).getMessageModel(), 'message');

		this.injectAppStylesheet();
		this.errorHandler = new ErrorHandler(this.getRouter(), this.authenticationService);

		this.setupRouteGuard();
		void this.restoreSessionOnStartup();
		this.getRouter().initialize();
	}

	private applyStoredTheme(): void {
		const storedTheme = readThemePreference();
		if (storedTheme && storedTheme !== Theming.getTheme()) {
			Theming.setTheme(storedTheme);
		}
	}

	private setupRouteGuard(): void {
		this.getRouter().attachBeforeRouteMatched((event: Router$BeforeRouteMatchedEvent) => {
			const routeName = event.getParameter('name');
			const sessionModel = this.getModel('session') as JSONModel;
			const session = sessionModel.getData() as { authenticated?: boolean };

			const isLoginRoute = !routeName || routeName === 'login';

			if (session.authenticated && isLoginRoute) {
				// Logged in but trying to reach login -> redirect to home
				event.preventDefault();
				this.getRouter().navTo('home', {}, undefined, true);
			} else if (!session.authenticated && !isLoginRoute) {
				// Not logged in but trying to reach protected page -> redirect to login
				event.preventDefault();
				this.getRouter().navTo('', {}, undefined, true);
			}
		});
	}

	private injectAppStylesheet(): void {
		if (document.head.querySelector('link[data-app-stylesheet="true"]')) {
			return;
		}

		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = new URL('css/style.css', document.baseURI).toString();
		link.setAttribute('data-app-stylesheet', 'true');
		document.head.appendChild(link);
	}

	private async restoreSessionOnStartup(): Promise<void> {
		const sessionModel = this.getModel('session') as JSONModel;
		const session = sessionModel.getData() as SessionData;

		// Case 1: a session is already stored locally -> validate it against the backend.
		if (session.authenticated) {
			try {
				await this.registryService.getPermissions();
				this.navigateAfterAutoLogin();
				return;
			} catch {
				// Stored session is stale; fall through to a fresh backend probe below.
			}
		}

		// Case 2: no valid local session. When the app is served from the authenticated
		// SAP system (deployed), the browser already holds a valid session cookie, so this
		// probe succeeds and we can skip the custom login form. Running standalone/locally
		// it fails with 401 and the login form is shown as usual.
		try {
			await ODataClient.checkAuthAndFetchCsrf();
			const restored: SessionData = {
				authenticated: true,
				userName: await this.resolveCurrentUser(),
				csrfToken: '',
				loginAt: new Date().toISOString()
			};
			sessionModel.setData(restored);
			writeSessionStorage(restored);
			this.navigateAfterAutoLogin();
		} catch {
			// Not authenticated at the server -> keep the custom login form.
			sessionModel.setData({
				authenticated: false,
				userName: '',
				csrfToken: '',
				loginAt: null
			});
		}
	}

	private navigateAfterAutoLogin(): void {
		const currentHash = window.location.hash.replace(/^#/, '');
		if (!currentHash || currentHash === 'login') {
			this.getRouter().navTo('home', {}, true);
		}
	}

	private async resolveCurrentUser(): Promise<string> {
		// The CSRF probe against our own OData service already echoes the
		// authenticated user's name in its body, same as the login form response.
		const probedUserName = ODataClient.getProbedUserName();
		if (probedUserName) {
			return probedUserName;
		}

		// Best-effort lookup of the logged-in user for display in the shell header.
		// When served from the SAP system the standard start_up service exposes it.
		try {
			const response = await fetch('/sap/bc/ui2/start_up?sap-client=324', {
				method: 'GET',
				credentials: 'include',
				headers: { Accept: 'application/json' }
			});
			if (response.ok) {
				const data = (await response.json()) as { CURRENT_USER?: string; currentUser?: string };
				const user = (data.CURRENT_USER ?? data.currentUser ?? '').trim();
				if (user) {
					return user;
				}
			}
		} catch {
			// Ignore and fall back to a generic label.
		}

		return 'SAP User';
	}

	public getContentDensityClass(): string {
		if (this.contentDensityClass === undefined) {
			if (document.body.classList.contains('sapUiSizeCozy') || document.body.classList.contains('sapUiSizeCompact')) {
				this.contentDensityClass = '';
			} else if (!Device.support.touch) {
				this.contentDensityClass = 'sapUiSizeCompact';
			} else {
				this.contentDensityClass = 'sapUiSizeCozy';
			}
		}
		return this.contentDensityClass;
	}

	public getAuthenticationService(): AuthenticationService {
		return this.authenticationService;
	}

	public getRegistryService(): RegistryService {
		return this.registryService;
	}

	public getVersionService(): VersionService {
		return this.versionService;
	}

	public getDetailService(): DetailService {
		return this.detailService;
	}

	public getJobService(): JobService {
		return this.jobService;
	}

	public getLogService(): LogService {
		return this.logService;
	}

	public getErrorHandler(): ErrorHandler {
		return this.errorHandler;
	}

	public getMessageManager(): typeof Messaging {
		return Messaging;
	}
}
