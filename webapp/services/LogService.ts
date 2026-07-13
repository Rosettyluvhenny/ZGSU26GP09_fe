import ODataClient from './ODataClient';

import type { LogEntry } from '../model/types';
import { mapLogEntity, normalizeODataCollection } from './ODataParsers';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}

export default class LogService {
	private readonly client = new ODataClient();

	public async getLogs(search = ''): Promise<LogEntry[]> {
		const backendLogs = await this.loadLogsFromBackend();
		return delay(this.filterLogs(backendLogs, search));
	}

	private filterLogs(logs: LogEntry[], search: string): LogEntry[] {
		const normalized = search.trim().toLowerCase();
		if (!normalized) {
			return logs;
		}

		return logs.filter((log) =>
			[log.id, log.actionType, log.actor, log.remarks, log.logResult, log.objectIdType, log.ipAddress]
				.join(' ')
				.toLowerCase()
				.includes(normalized)
		);
	}

	private async loadLogsFromBackend(): Promise<LogEntry[]> {
		const payload = await this.client.readJson('/Log?$orderby=ActionAt desc');
		return normalizeODataCollection(payload).map((entity) => mapLogEntity(entity));
	}
}
