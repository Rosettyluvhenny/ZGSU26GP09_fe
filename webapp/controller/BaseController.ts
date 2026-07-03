import Controller from 'sap/ui/core/mvc/Controller';
import UIComponent from 'sap/ui/core/UIComponent';
import AppComponent from '../Component';
import Model from 'sap/ui/model/Model';
import JSONModel from 'sap/ui/model/json/JSONModel';
import ResourceModel from 'sap/ui/model/resource/ResourceModel';
import ResourceBundle from 'sap/base/i18n/ResourceBundle';
import Router from 'sap/ui/core/routing/Router';
import History from 'sap/ui/core/routing/History';
import type { JobStatus, RegistryStatus } from '../model/types';

/**
 * @namespace com.zgp9.fe.controller
 */
export default abstract class BaseController extends Controller {
	public getOwnerComponent(): AppComponent {
		return super.getOwnerComponent() as AppComponent;
	}

	public getAppComponent(): AppComponent {
		return this.getOwnerComponent();
	}

	public getRouter(): Router {
		return UIComponent.getRouterFor(this);
	}

	public getResourceBundle(): Promise<ResourceBundle> {
		const model = this.getOwnerComponent().getModel('i18n') as ResourceModel;
		return model.getResourceBundle() as Promise<ResourceBundle>;
	}

	public getModel(sName?: string): Model {
		return this.getView().getModel(sName);
	}

	public setModel(oModel: Model, sName?: string): BaseController {
		this.getView().setModel(oModel, sName);
		return this;
	}

	public getUiModel(): JSONModel {
		return this.getOwnerComponent().getModel('ui') as JSONModel;
	}

	public getSessionModel(): JSONModel {
		return this.getOwnerComponent().getModel('session') as JSONModel;
	}

	public navTo(sName: string, oParameters?: object, bReplace?: boolean): void {
		this.getRouter().navTo(sName, oParameters, undefined, bReplace);
	}

	public async handleServiceError(error: unknown): Promise<void> {
		await this.getOwnerComponent().getErrorHandler().handle(error);
	}

	public formatDateTime(value: string): string {
		if (!value) {
			return '';
		}

		return new Intl.DateTimeFormat('en', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	public formatDuration(durationMs: number | null): string {
		if (durationMs === null || durationMs === undefined) {
			return '';
		}

		const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}m ${seconds}s`;
	}

	public formatStatusState(status: RegistryStatus | JobStatus): 'Success' | 'Warning' | 'Error' | 'Information' | 'None' {
		switch (status) {
			case 'Publish':
			case 'Completed':
				return 'Success';
			case 'Unpublish':
			case 'Queued':
				return 'Warning';
			case 'Archive':
				return 'None';
			case 'Failed':
				return 'Error';
			case 'Running':
				return 'Information';
			default:
				return 'None';
		}
	}

	public async onNavBack(): Promise<void> {
		const previousHash = History.getInstance().getPreviousHash();
		if (previousHash !== undefined) {
			window.history.go(-1);
		} else {
			this.getRouter().navTo('login', {}, undefined, true);
		}
	}
}
