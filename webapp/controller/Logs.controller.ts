import JSONModel from 'sap/ui/model/json/JSONModel';
import Fragment from 'sap/ui/core/Fragment';
import type Dialog from 'sap/m/Dialog';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { LogEntry } from '../model/types';
import { LOG_PAGE_SIZE, type LogQueryFilter } from '../services/LogService';

interface FilterOption {
	key: string;
	text: string;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
	VI: 'View',
	CR: 'Create',
	UP: 'Update',
	DE: 'Delete',
	GE: 'Generate',
	CO: 'Compare',
	LO: 'Login',
	LG: 'Logout',
	SC: 'Scan',
	GN: 'Generate',
	CM: 'Compare'
};

const ACTION_TYPE_OPTIONS: FilterOption[] = [
	{ key: 'All', text: 'All' },
	{ key: 'VI', text: 'View (VI)' },
	{ key: 'CR', text: 'Create (CR)' },
	{ key: 'UP', text: 'Update (UP)' },
	{ key: 'DE', text: 'Delete (DE)' },
	{ key: 'GE', text: 'Generate (GE)' },
	{ key: 'GN', text: 'Generate (GN)' },
	{ key: 'CO', text: 'Compare (CO)' },
	{ key: 'CM', text: 'Compare (CM)' },
	{ key: 'SC', text: 'Scan (SC)' },
	{ key: 'LO', text: 'Login (LO)' },
	{ key: 'LG', text: 'Logout (LG)' }
];

const LOG_RESULT_OPTIONS: FilterOption[] = [
	{ key: 'All', text: 'All' },
	{ key: 'SUCCESS', text: 'Success' },
	{ key: 'FAIL', text: 'Fail' },
	{ key: 'FAILURE', text: 'Failure' },
	{ key: 'ERROR', text: 'Error' }
];

const OBJECT_TYPE_OPTIONS: FilterOption[] = [
	{ key: 'All', text: 'All' },
	{ key: 'REGISTRY', text: 'Registry' },
	{ key: 'DETAIL', text: 'Detail' },
	{ key: 'VERSION', text: 'Version' },
	{ key: 'SCANJOB', text: 'Scan Job' }
];

/**
 * @namespace com.zgp9.fe.controller
 */
export default class Logs extends BaseController {
	private detailDialog?: Dialog;
	private dateFrom: Date | null = null;
	private dateTo: Date | null = null;
	private loadingMore = false;

	public onInit(): void {
		this.setModel(
			new JSONModel({
				items: [] as LogEntry[],
				busy: false,
				loadingMore: false,
				search: '',
				actionType: 'All',
				logResult: 'All',
				objectIdType: 'All',
				actionTypeOptions: ACTION_TYPE_OPTIONS,
				logResultOptions: LOG_RESULT_OPTIONS,
				objectIdTypeOptions: OBJECT_TYPE_OPTIONS,
				selectedLog: null as LogEntry | null,
				activeJobId: '',
				activeJobLabel: '',
				totalCount: 0,
				hasMore: false,
				countLabel: '0 entries'
			}),
			'logList'
		);

		this.getRouter()
			.getRoute('logs')
			.attachPatternMatched((event: UI5Event) => {
				void this.onRouteMatched(event);
			});
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as unknown as { getParameter: (name: string) => Record<string, unknown> }).getParameter('arguments') as Record<string, unknown>;
		const query = args['?query'] as Record<string, string> | undefined;
		const jobId = query?.jobId ?? '';

		const model = this.getModel('logList') as JSONModel;
		model.setProperty('/activeJobId', jobId);
		model.setProperty('/activeJobLabel', jobId || '');

		await this.loadLogs(true);
	}

	public async onGo(): Promise<void> {
		await this.loadLogs(true);
	}

	public async onRefresh(): Promise<void> {
		await this.loadLogs(true);
	}

	public async onClearFilters(): Promise<void> {
		const model = this.getModel('logList') as JSONModel;
		model.setProperty('/actionType', 'All');
		model.setProperty('/logResult', 'All');
		model.setProperty('/objectIdType', 'All');
		model.setProperty('/search', '');
		this.dateFrom = null;
		this.dateTo = null;
		await this.loadLogs(true);
	}

	public onSearchLiveChange(event: UI5Event): void {
		const source = event.getSource() as unknown as { getValue: () => string };
		(this.getModel('logList') as JSONModel).setProperty('/search', source.getValue());
	}

	public async onSearch(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getValue: () => string };
		(this.getModel('logList') as JSONModel).setProperty('/search', source.getValue());
		await this.loadLogs(true);
	}

	public onFilterChange(): void {
		// Applied on Go / Refresh (server-side).
	}

	public onDateRangeChange(event: UI5Event): void {
		const source = event.getSource() as unknown as { getDateValue: () => Date | null; getSecondDateValue: () => Date | null };
		this.dateFrom = source.getDateValue();
		this.dateTo = source.getSecondDateValue();
	}

	public async onLoadMore(): Promise<void> {
		if (this.loadingMore) {
			return;
		}
		await this.loadLogs(false);
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

	public async onClearJobFilter(): Promise<void> {
		const model = this.getModel('logList') as JSONModel;
		model.setProperty('/activeJobId', '');
		model.setProperty('/activeJobLabel', '');
		this.getRouter().navTo('logs', {}, undefined, true);
	}

	public formatLogResultState(result: string): 'Success' | 'Error' | 'None' {
		const normalized = (result || '').toUpperCase();
		if (normalized === 'S' || normalized === 'SUCCESS') {
			return 'Success';
		}
		if (normalized === 'F' || normalized.startsWith('FAIL') || normalized === 'ERROR' || normalized === 'E') {
			return 'Error';
		}
		return 'None';
	}

	public formatActionType(code: string): string {
		if (!code) {
			return '';
		}
		return ACTION_TYPE_LABELS[code.toUpperCase()] ?? code;
	}

	public formatShortId(id: string): string {
		if (!id) {
			return '—';
		}
		const normalized = id.replace(/[{}]/g, '');
		if (normalized.length <= 13) {
			return normalized;
		}
		return `${normalized.slice(0, 8)}…${normalized.slice(-4)}`;
	}

	private async loadLogs(reset: boolean): Promise<void> {
		const model = this.getModel('logList') as JSONModel;
		const currentItems = (model.getProperty('/items') as LogEntry[]) ?? [];
		const skip = reset ? 0 : currentItems.length;

		if (!reset) {
			if (!model.getProperty('/hasMore') || this.loadingMore) {
				return;
			}
			this.loadingMore = true;
			model.setProperty('/loadingMore', true);
		} else {
			model.setProperty('/busy', true);
		}

		try {
			const filter: LogQueryFilter = {
				...this.buildQueryFilter(),
				top: LOG_PAGE_SIZE,
				skip
			};
			const page = await this.getOwnerComponent().getLogService().getLogs(filter);
			const items = reset ? page.items : currentItems.concat(page.items);
			const totalCount = page.totalCount;
			const hasMore = items.length < totalCount && page.items.length > 0;

			model.setProperty('/items', items);
			model.setProperty('/totalCount', totalCount);
			model.setProperty('/hasMore', hasMore);
			model.setProperty('/countLabel', this.buildCountLabel(items.length, totalCount));
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			model.setProperty('/loadingMore', false);
			this.loadingMore = false;
		}
	}

	private buildCountLabel(shown: number, total: number): string {
		if (total <= 0) {
			return '0 entries';
		}
		if (shown >= total) {
			return `${total} entries`;
		}
		return `Showing ${shown} of ${total}`;
	}

	private buildQueryFilter(): LogQueryFilter {
		const model = this.getModel('logList') as JSONModel;
		return {
			jobId: (model.getProperty('/activeJobId') as string) || undefined,
			actionType: model.getProperty('/actionType') as string,
			logResult: model.getProperty('/logResult') as string,
			objectIdType: model.getProperty('/objectIdType') as string,
			dateFrom: this.dateFrom,
			dateTo: this.dateTo,
			search: (model.getProperty('/search') as string) || undefined
		};
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
