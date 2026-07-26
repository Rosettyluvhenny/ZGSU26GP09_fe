import UIComponent from 'sap/ui/core/UIComponent';
import { support } from 'sap/ui/Device';
// UI5 1.108 has no sap/ui/core/Theming or sap/ui/core/Messaging — those modules arrived with
// the ~1.118 core split. The Core singleton carries applyTheme/getConfiguration/
// getMessageManager instead, and is what the launchpad's 1.108.33 runtime provides.
import Core from 'sap/ui/core/Core';
import JSONModel from 'sap/ui/model/json/JSONModel';

import { readThemePreference } from './services/SessionStorage';

import AuthenticationService from './services/AuthenticationService';
import DetailService from './services/DetailService';
import ErrorHandler from './services/ErrorHandler';
import JobService from './services/JobService';
import LogService from './services/LogService';
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
		// ui5lint-disable-next-line no-deprecated-api -- sap/ui/core/Messaging, the non-deprecated replacement, does not exist on the launchpad's UI5 1.108.33
		this.setModel(Core.getMessageManager().getMessageModel(), 'message');

		this.injectAppStylesheet();
		this.errorHandler = new ErrorHandler(this.getRouter());

		this.registerViewportWidthTracking();

		this.getRouter().initialize();
	}

	// Keep a viewport-width flag on the ui model so layouts (e.g. the split-view
	// Splitters) can switch to a stacked orientation on narrow screens. Unlike
	// device>/system/phone, this reacts to desktop window resizing and browser zoom.
	private registerViewportWidthTracking(): void {
		const ui = this.getModel('ui') as JSONModel;
		// matchMedia reflects the CSS viewport width, so it fires reliably on window
		// resize and also when the user zooms the browser (unlike Device.resize, which
		// is throttled and can miss programmatic/emulated resizes).
		// isPhoneWidth (<600px) drives the shell nav overlay; isNarrowWidth (<1024px)
		// drives the split-view panes (tree ‖ XML) so they stack vertically whenever
		// there isn't enough room to show them side by side comfortably.
		const phoneMql = window.matchMedia('(max-width: 599px)');
		const narrowMql = window.matchMedia('(max-width: 1023px)');
		const update = (): void => {
			ui.setProperty('/isPhoneWidth', phoneMql.matches);
			ui.setProperty('/isNarrowWidth', narrowMql.matches);
		};
		update();
		phoneMql.addEventListener('change', update);
		narrowMql.addEventListener('change', update);
		window.addEventListener('resize', update);
	}

	private applyStoredTheme(): void {
		const storedTheme = readThemePreference();
		// ui5lint-disable-next-line no-deprecated-api -- sap/ui/core/Theming does not exist on the launchpad's UI5 1.108.33
		if (storedTheme && storedTheme !== Core.getConfiguration().getTheme()) {
			// ui5lint-disable-next-line no-deprecated-api -- as above; Theming.setTheme is unavailable on 1.108.33
			Core.applyTheme(storedTheme);
		}
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

	public getContentDensityClass(): string {
		if (this.contentDensityClass === undefined) {
			if (document.body.classList.contains('sapUiSizeCozy') || document.body.classList.contains('sapUiSizeCompact')) {
				this.contentDensityClass = '';
			} else if (!support.touch) {
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
}
