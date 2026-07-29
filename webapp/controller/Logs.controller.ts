import JSONModel from 'sap/ui/model/json/JSONModel';
import Fragment from 'sap/ui/core/Fragment';
import MessageToast from 'sap/m/MessageToast';
import type Dialog from 'sap/m/Dialog';
import type UI5Event from 'sap/ui/base/Event';

import BaseController from './BaseController';
import type { LogEntry } from '../model/types';
import { LOG_PAGE_SIZE, type LogQueryFilter } from '../services/LogService';
import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';

interface FilterOption {
	key: string;
	text: string;
}

/**
 * @namespace com.zgp9.fe.controller
 */
export default class Logs extends BaseController {
	private detailDialog?: Dialog;
	private dateFrom: Date | null = null;
	private dateTo: Date | null = null;
	private loadingMore = false;
	/** Distinct values seen from backend responses — never hard-coded. */
	private knownActions = new Map<string, string>();
	private knownLogResults = new Set<string>();
	private knownObjectIdTypes = new Set<string>();

	public onInit(): void {
		const model = new JSONModel({
			items: [] as LogEntry[],
			busy: false,
			loadingMore: false,
			search: '',
			actionType: 'All',
			logResult: 'All',
			objectIdType: 'All',
			// Filter options are built from values returned by the backend — never invented.
			actionTypeOptions: [{ key: 'All', text: 'All' }] as FilterOption[],
			logResultOptions: [{ key: 'All', text: 'All' }] as FilterOption[],
			objectIdTypeOptions: [{ key: 'All', text: 'All' }] as FilterOption[],
			selectedLog: null as LogEntry | null,
			activeJobId: '',
			activeJobLabel: '',
			totalCount: 0,
			hasMore: false,
			countLabel: '0 entries'
		});
		// JSONModel default sizeLimit is 100 — without raising it, More can load 207
		// into the model while the table only renders the first 100 rows.
		model.setSizeLimit(5000);
		this.setModel(model, 'logList');

		this.getRouter()
			.getRoute('logs')
			.attachPatternMatched((event: UI5Event) => {
				void this.onRouteMatched(event);
			});
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as Route$PatternMatchedEvent).getParameter('arguments') as Record<string, unknown>;
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

	public async onFilterChange(): Promise<void> {
		await this.loadLogs(true);
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

	public async onNavigateToObject(): Promise<void> {
		const log = (this.getModel('logList') as JSONModel).getProperty('/selectedLog') as LogEntry | null;
		if (!log || !log.objectId) {
			return;
		}

		const objectType = (log.objectIdType || '').toUpperCase();
		if (objectType === 'REGISTRY') {
			this.closeDetailDialog();
			this.navTo('registryDetail', { registryId: log.objectId });
			return;
		}

		if (objectType === 'VERSION') {
			try {
				const version = await this.getOwnerComponent().getVersionService().getVersion(log.objectId);
				const registryId = version.groupId;
				if (!registryId) {
					MessageToast.show('Cannot open version: registry is missing.');
					return;
				}
				this.closeDetailDialog();
				this.navTo('versionDetail', { registryId, versionId: log.objectId });
			} catch (error) {
				await this.handleServiceError(error);
			}
			return;
		}

		if (objectType === 'DETAIL') {
			try {
				const detail = await this.getOwnerComponent().getDetailService().getDetail(log.objectId);
				if (!detail.groupId || !detail.versionId) {
					MessageToast.show('Cannot open detail: version or registry is missing.');
					return;
				}
				this.closeDetailDialog();
				this.navTo('versionDetail', {
					registryId: detail.groupId,
					versionId: detail.versionId,
					query: { detailId: log.objectId }
				});
			} catch (error) {
				await this.handleServiceError(error);
			}
		}
	}

	public onCloseDetailDialog(): void {
		this.closeDetailDialog();
	}

	public onClearJobFilter(): void {
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

	/** CREATE → green, UPDATE → yellow; other actions stay neutral. */
	public formatLogActionState(action: string): 'Success' | 'Warning' | 'None' {
		const normalized = (action || '').toUpperCase().trim();
		if (normalized === 'CREATE' || normalized === 'C') {
			return 'Success';
		}
		if (normalized === 'UPDATE' || normalized === 'U' || normalized === 'UP') {
			return 'Warning';
		}
		return 'None';
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
			this.refreshFilterOptions(items);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			model.setProperty('/loadingMore', false);
			this.loadingMore = false;
		}
	}

	/** Accumulate distinct backend values and rebuild Select options (never invent codes). */
	private refreshFilterOptions(items: LogEntry[]): void {
		for (const item of items) {
			const actionType = (item.actionType || '').trim();
			const actionText = (item.actionText || '').trim() || actionType;
			const result = (item.logResult || '').trim();
			const objectType = (item.objectIdType || '').trim();
			if (actionType) {
				this.knownActions.set(actionType, actionText);
			}
			if (result) {
				this.knownLogResults.add(result);
			}
			if (objectType) {
				this.knownObjectIdTypes.add(objectType);
			}
		}

		const model = this.getModel('logList') as JSONModel;
		model.setProperty(
			'/actionTypeOptions',
			[
				{ key: 'All', text: 'All' },
				...[...this.knownActions.entries()]
					.sort((a, b) => a[1].localeCompare(b[1]))
					.map(([key, text]) => ({ key, text }))
			]
		);
		model.setProperty('/logResultOptions', this.buildOptionsFromSet(this.knownLogResults));
		model.setProperty('/objectIdTypeOptions', this.buildOptionsFromSet(this.knownObjectIdTypes));

		// If the current selection vanished from the option list, fall back to All.
		this.ensureSelectedFilterKey('/actionType', '/actionTypeOptions');
		this.ensureSelectedFilterKey('/logResult', '/logResultOptions');
		this.ensureSelectedFilterKey('/objectIdType', '/objectIdTypeOptions');
	}

	private buildOptionsFromSet(values: Set<string>): FilterOption[] {
		const unique = [...values].sort((a, b) => a.localeCompare(b));
		return [{ key: 'All', text: 'All' }, ...unique.map((value) => ({ key: value, text: value }))];
	}

	private ensureSelectedFilterKey(selectedPath: string, optionsPath: string): void {
		const model = this.getModel('logList') as JSONModel;
		const selected = (model.getProperty(selectedPath) as string) || 'All';
		const options = (model.getProperty(optionsPath) as FilterOption[]) ?? [];
		if (!options.some((option) => option.key === selected)) {
			model.setProperty(selectedPath, 'All');
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
