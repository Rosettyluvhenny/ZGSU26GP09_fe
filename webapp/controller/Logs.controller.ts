import JSONModel from 'sap/ui/model/json/JSONModel';
import Fragment from 'sap/ui/core/Fragment';
import type Dialog from 'sap/m/Dialog';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { LogEntry } from '../model/types';

interface FilterOption {
	key: string;
	text: string;
}

/**
 * @namespace com.zgp9.fe.controller
 */
export default class Logs extends BaseController {
	private allLogs: LogEntry[] = [];
	private detailDialog?: Dialog;
	private dateFrom: Date | null = null;
	private dateTo: Date | null = null;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [],
				busy: false,
				search: '',
				actionType: 'All',
				logResult: 'All',
				objectIdType: 'All',
				actionTypeOptions: [] as FilterOption[],
				logResultOptions: [] as FilterOption[],
				objectIdTypeOptions: [] as FilterOption[],
				selectedLog: null as LogEntry | null
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

	public onSearchLiveChange(event: UI5Event): void {
		const source = event.getSource() as unknown as { getValue: () => string };
		(this.getModel('logList') as JSONModel).setProperty('/search', source.getValue());
		this.applyFilters();
	}

	public onFilterChange(): void {
		this.applyFilters();
	}

	public onDateRangeChange(event: UI5Event): void {
		const source = event.getSource() as unknown as { getDateValue: () => Date | null; getSecondDateValue: () => Date | null };
		this.dateFrom = source.getDateValue();
		this.dateTo = source.getSecondDateValue();
		this.applyFilters();
	}

	public onRowPress(event: UI5Event): void {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => LogEntry } | null };
		const log = source.getBindingContext('logList')?.getObject();
		if (!log) {
			return;
		}

		void this.openDetailDialog(log);
	}

	public onNavigateToObject(): void {
		const log = (this.getModel('logList') as JSONModel).getProperty('/selectedLog') as LogEntry | null;
		if (!log || !log.objectId) {
			return;
		}

		this.closeDetailDialog();

		if (log.objectIdType === 'REGISTRY') {
			this.navTo('registryDetail', { registryId: log.objectId });
		}
	}

	public onCloseDetailDialog(): void {
		this.closeDetailDialog();
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
			this.allLogs = await this.getOwnerComponent().getLogService().getLogs();
			this.buildFilterOptions();
			this.applyFilters();
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
		}
	}

	private applyFilters(): void {
		const model = this.getModel('logList') as JSONModel;
		const search = (model.getProperty('/search') as string).trim().toLowerCase();
		const actionType = model.getProperty('/actionType') as string;
		const logResult = model.getProperty('/logResult') as string;
		const objectIdType = model.getProperty('/objectIdType') as string;

		const filtered = this.allLogs.filter((log) => {
			if (actionType !== 'All' && log.actionType !== actionType) {
				return false;
			}
			if (logResult !== 'All' && log.logResult !== logResult) {
				return false;
			}
			if (objectIdType !== 'All' && log.objectIdType !== objectIdType) {
				return false;
			}
			if (this.dateFrom || this.dateTo) {
				const actionAt = new Date(log.actionAt).getTime();
				if (Number.isNaN(actionAt)) {
					return false;
				}
				if (this.dateFrom && actionAt < this.startOfDay(this.dateFrom).getTime()) {
					return false;
				}
				if (this.dateTo && actionAt > this.endOfDay(this.dateTo).getTime()) {
					return false;
				}
			}
			if (search) {
				const haystack = [log.id, log.actionType, log.actor, log.remarks, log.logResult, log.objectIdType, log.ipAddress]
					.join(' ')
					.toLowerCase();
				if (!haystack.includes(search)) {
					return false;
				}
			}
			return true;
		});

		model.setProperty('/items', filtered);
	}

	private startOfDay(date: Date): Date {
		const result = new Date(date);
		result.setHours(0, 0, 0, 0);
		return result;
	}

	private endOfDay(date: Date): Date {
		const result = new Date(date);
		result.setHours(23, 59, 59, 999);
		return result;
	}

	private buildFilterOptions(): void {
		const model = this.getModel('logList') as JSONModel;
		model.setProperty('/actionTypeOptions', this.distinctOptions((log) => log.actionType));
		model.setProperty('/logResultOptions', this.distinctOptions((log) => log.logResult));
		model.setProperty('/objectIdTypeOptions', this.distinctOptions((log) => log.objectIdType));
	}

	private distinctOptions(selector: (log: LogEntry) => string): FilterOption[] {
		const values = Array.from(new Set(this.allLogs.map(selector).filter((value) => Boolean(value)))).sort();
		return [{ key: 'All', text: 'All' }, ...values.map((value) => ({ key: value, text: value }))];
	}

	private async openDetailDialog(log: LogEntry): Promise<void> {
		(this.getModel('logList') as JSONModel).setProperty('/selectedLog', log);

		if (!this.detailDialog) {
			this.detailDialog = (await Fragment.load({
				id: this.getView().getId(),
				name: 'com.zgp9.fe.view.fragments.LogDetailDialog',
				controller: this
			})) as Dialog;
			this.getView().addDependent(this.detailDialog);
		}

		this.detailDialog.open();
	}

	private closeDetailDialog(): void {
		this.detailDialog?.close();
	}
}
