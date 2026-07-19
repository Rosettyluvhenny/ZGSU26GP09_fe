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
		this.errorHandler = new ErrorHandler(this.getRouter());


		this.getRouter().initialize();
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
