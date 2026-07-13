import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { LogEntry } from '../model/types';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class Logs extends BaseController {
	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [],
				busy: false,
				search: ''
			}),
			'logList'
		);

		this.getRouter()
			.getRoute('logs')
			.attachPatternMatched(() => {
				void this.loadLogs();
			});
	}

	public async onRefresh(): Promise<void> {
		await this.loadLogs();
	}

	public async onSearchLiveChange(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getValue: () => string };
		const model = this.getModel('logList') as JSONModel;
		model.setProperty('/search', source.getValue());
		await this.loadLogs();
	}

	public onRowPress(event: UI5Event): void {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => LogEntry } | null };
		const log = source.getBindingContext('logList')?.getObject();
		if (!log || log.objectIdType !== 'REGISTRY' || !log.objectId) {
			return;
		}

		this.navTo('registryDetail', { registryId: log.objectId });
	}

	public formatLogResultState(result: string): 'Success' | 'Error' | 'None' {
		const normalized = (result || '').toUpperCase();
		if (normalized === 'SUCCESS') {
			return 'Success';
		}
		if (normalized === 'FAILURE' || normalized === 'ERROR') {
			return 'Error';
		}
		return 'None';
	}

	private async loadLogs(): Promise<void> {
		const model = this.getModel('logList') as JSONModel;
		model.setProperty('/busy', true);
		try {
			const logs = await this.getOwnerComponent().getLogService().getLogs(model.getProperty('/search') as string);
			model.setProperty('/items', logs);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}
}
