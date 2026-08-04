import UIComponent from 'sap/ui/core/UIComponent';
import Device from 'sap/ui/Device';
import * as Messaging from 'sap/ui/core/Messaging';
import Theming from 'sap/ui/core/Theming';
import MessageModel from 'sap/ui/model/message/MessageModel';
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

	private authenticationService!: AuthenticationService;
	private detailService!: DetailService;
	private registryService!: RegistryService;
	private versionService!: VersionService;
	private jobService!: JobService;
	private logService!: LogService;
	private errorHandler!: ErrorHandler;
	private contentDensityClass: string;

	public init(): void {
		super.init();

		const model = this.getModel() as import("sap/ui/model/odata/v4/ODataModel").default;
		this.authenticationService = new AuthenticationService(model);
		this.detailService = new DetailService(model);
		this.registryService = new RegistryService(model);
		this.versionService = new VersionService(this.detailService, model);
		this.jobService = new JobService(model);
		this.logService = new LogService(model);

		this.applyStoredTheme();
		this.setModel(models.createDeviceModel(), 'device');
		this.setModel(models.createSessionModel(), 'session');
		this.setModel(models.createUiModel(), 'ui');
		this.setModel((Messaging as unknown as { getMessageModel: () => MessageModel }).getMessageModel(), 'message');

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
		// drives the split-view panes (tree â€– XML) so they stack vertically whenever
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
		if (storedTheme && storedTheme !== Theming.getTheme()) {
			Theming.setTheme(storedTheme);
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


