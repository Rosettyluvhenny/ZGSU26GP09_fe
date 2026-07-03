import UIComponent from 'sap/ui/core/UIComponent';
import Device from 'sap/ui/Device';
import * as Messaging from 'sap/ui/core/Messaging';

import AuthenticationService from './services/AuthenticationService';
import DetailService from './services/DetailService';
import ErrorHandler from './services/ErrorHandler';
import JobService from './services/JobService';
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
	private errorHandler!: ErrorHandler;
	private contentDensityClass: string;

	public init(): void {
		super.init();

		this.setModel(models.createDeviceModel(), 'device');
		this.setModel(models.createSessionModel(), 'session');
		this.setModel(models.createUiModel(), 'ui');
		this.setModel((Messaging as any).getMessageModel(), 'message');

		this.errorHandler = new ErrorHandler(this.getRouter(), this.authenticationService);
		this.getRouter().initialize();
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

	public getErrorHandler(): ErrorHandler {
		return this.errorHandler;
	}

	public getMessageManager(): any {
		return Messaging;
	}
}
