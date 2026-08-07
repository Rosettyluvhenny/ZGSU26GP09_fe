import JSONModel from 'sap/ui/model/json/JSONModel';
import type UI5Event from 'sap/ui/base/Event';
import type { Router$RouteMatchedEvent } from 'sap/ui/core/routing/Router';

import BaseController from './BaseController';
import type { job, logEntry, metadataDetails, registry, registryVersion } from '../model/types';

interface RegistryStats {
	total: number;
	published: number;
	unpublished: number;
	archive: number;
}

interface KpiDelta {
	/** Registries created within the trend window — a true new-vs-old delta. */
	totalNew: number;
	/** Registries currently in each status whose lastChangedAt is within the window. */
	publishedChanged: number;
	unpublishedChanged: number;
	archiveChanged: number;
}

interface AttentionItem {
	icon: string;
	text: string;
	state: 'Warning' | 'Error';
	action: 'registries' | 'jobs';
}

type ActivityState = 'Success' | 'Warning' | 'Error' | 'Information' | 'None';

/** A single row in the merged Recent Activity feed (scan jobs + audit logs). */
interface ActivityItem {
	icon: string;
	title: string;
	subtitle: string;
	timeAgo: string;
	state: ActivityState;
	kind: 'job' | 'log';
	/** REGISTRY | VERSION | DETAIL | SCANJOB — drives navigation on press. */
	objectIdType: string;
	objectId: string;
}

interface ScanTrendPoint {
	label: string;
	value: number;
	/** Bar height as a percentage of the tallest day (0-value days get a small stub). */
	heightPct: number;
	/** Drives the bar styling via a writeToDom data-attribute: today | empty | normal. */
	state: 'today' | 'empty' | 'normal';
	tooltip: string;
}

interface ScanTrendSummary {
	total: number;
	peakValue: number;
	peakLabel: string;
	startLabel: string;
	endLabel: string;
}

interface ChangeDetail {
	text: string;
	severity: 'Breaking' | 'Compatible';
}

interface RegistryChangeSummary {
	/** e.g. "3 entities added · 2 properties added · 1 property removed" */
	headline: string;
	breaking: boolean;
	hasBaseline: boolean;
	details: ChangeDetail[];
}

/** Registry enriched with a change summary derived from its two most recent versions. */
type RegistryCard = registry & { changeSummary: RegistryChangeSummary };

interface ChangeGroup {
	noun: string;
	verb: string;
	count: number;
}

/** Metadata categories diffed to build a change summary; entityTypes/entitySets are merged separately into "entity". */
const DIFF_CATEGORIES: Array<{ key: keyof metadataDetails; noun: string }> = [
	{ key: 'properties', noun: 'property' },
	{ key: 'navigationProperties', noun: 'navigation property' },
	{ key: 'functionImports', noun: 'function import' },
	{ key: 'actions', noun: 'action' },
	{ key: 'complexTypes', noun: 'complex type' }
];

const RECENT_LIMIT = 5;
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_LIMIT = 8;
const ACTIVITY_LOG_FETCH = 15;
const SCAN_TREND_DAYS = 14;
const AUTO_REFRESH_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @namespace com.zgp09.fe.controller
 */
export default class Home extends BaseController {
	private refreshTimer: number | null = null;
	private readonly onVisibilityChange = (): void => {
		// Refresh immediately when the tab becomes visible again so the user
		// never returns to stale numbers; the interval keeps it fresh after that.
		if (!document.hidden) {
			void this.refreshLight();
		}
	};
	// Arrow field so it stays bound when attached/detached from the router.
	private readonly onAnyRouteMatched = (event: Router$RouteMatchedEvent): void => {
		if (event.getParameter('name') !== 'home') {
			this.stopAutoRefresh();
		}
	};
	/** Cached change summaries keyed by registry id, so the 60s poll only re-diffs registries that actually changed. */
	private readonly summaryCache = new Map<string, { lastChangedAt: string; summary: RegistryChangeSummary }>();

	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				registryStats: { total: 0, published: 0, unpublished: 0, archive: 0 },
				kpiDelta: { totalNew: 0, publishedChanged: 0, unpublishedChanged: 0, archiveChanged: 0 },
				recentRegistries: [] as RegistryCard[],
				activity: [] as ActivityItem[],
				scanTrend: [] as ScanTrendPoint[],
				scanSummary: { total: 0, peakValue: 0, peakLabel: '', startLabel: '', endLabel: '' },
				attentionItems: [] as AttentionItem[],
				attentionCount: 0,
				lastUpdated: null as string | null
			}),
			'home'
		);

		this.getRouter()
			.getRoute('home')
			.attachPatternMatched(() => {
				void this.loadDashboard();
				this.startAutoRefresh();
			});

		// The Home view is cached in the FlexibleColumnLayout, so onExit does not
		// fire on navigation — stop polling as soon as any other route matches.
		this.getRouter().attachRouteMatched(this.onAnyRouteMatched, this);
		document.addEventListener('visibilitychange', this.onVisibilityChange);
	}

	public onExit(): void {
		this.stopAutoRefresh();
		this.getRouter().detachRouteMatched(this.onAnyRouteMatched, this);
		document.removeEventListener('visibilitychange', this.onVisibilityChange);
	}

	private startAutoRefresh(): void {
		if (this.refreshTimer !== null) {
			return;
		}
		this.refreshTimer = window.setInterval(() => {
			// Skip hidden tabs — no point polling the backend nobody is watching.
			if (!document.hidden) {
				void this.refreshLight();
			}
		}, AUTO_REFRESH_MS);
	}

	private stopAutoRefresh(): void {
		if (this.refreshTimer !== null) {
			window.clearInterval(this.refreshTimer);
			this.refreshTimer = null;
		}
	}

	public onNavigateRegistries(event?: UI5Event): void {
		const source = event?.getSource() as unknown as { data?: (key: string) => string | null } | undefined;
		const status = source?.data?.('status');
		this.navTo('registryList', status ? { query: { status } } : {});
	}

	public onNavigateJobs(): void {
		this.navTo('jobList');
	}

	public onRegistryPress(event: UI5Event): void {
		const registry = this.getEntityFromEvent<registry>(event);
		if (!registry) {
			return;
		}

		this.navTo('registryDetail', { registryId: registry.groupId });
	}

	public onAttentionItemPress(event: UI5Event): void {
		const item = this.getEntityFromEvent<AttentionItem>(event);
		if (!item) {
			return;
		}

		if (item.action === 'jobs') {
			this.onNavigateJobs();
		} else {
			this.onNavigateRegistries();
		}
	}

	public formatRelativeTime(value: string): string {
		if (!value) {
			return '';
		}

		const then = new Date(value).getTime();
		if (Number.isNaN(then)) {
			return '';
		}

		const diffMs = Date.now() - then;
		const minutes = Math.floor(diffMs / 60000);
		if (minutes < 1) {
			return 'just now';
		}
		if (minutes < 60) {
			return `${minutes} min ago`;
		}
		const hours = Math.floor(minutes / 60);
		if (hours < 24) {
			return `${hours} hour${hours === 1 ? '' : 's'} ago`;
		}
		const days = Math.floor(hours / 24);
		if (days < 30) {
			return `${days} day${days === 1 ? '' : 's'} ago`;
		}

		return this.formatDateTime(value);
	}

	public formatJobTitle(job: job | undefined): string {
		if (!job) {
			return '';
		}
		return `${this.formatTriggerLabel(job)} scan`;
	}

	public formatJobSubtitle(job: job | undefined): string {
		if (!job) {
			return '';
		}

		const registriesLabel = `${job.totalRegistry} registr${job.totalRegistry === 1 ? 'y' : 'ies'}`;
		const completionPhrase = this.formatCompletionPhrase(job);
		const changesLabel = this.formatChangesLabel(job);
		const relativeTime = this.formatRelativeTime(job.startedAt);
		const errorSuffix = job.status === 'Failed' && job.errorMessage ? ` — ${job.errorMessage}` : '';

		return `${registriesLabel} · ${completionPhrase} · ${changesLabel} · ${relativeTime}${errorSuffix}`;
	}

	private formatTriggerLabel(job: job): string {
		switch ((job.triggerType || '').toUpperCase()) {
			case 'SCHEDULE':
			case 'SCHEDULED':
				return 'Scheduled';
			case 'MANUAL':
				return 'Manual';
			case 'API':
				return 'API';
			default:
				return job.triggerText || 'Scan';
		}
	}

	private formatCompletionPhrase(job: job): string {
		const duration = this.formatDuration(job.durationMs);
		switch (job.status) {
			case 'Running':
				return 'In progress';
			case 'Queued':
				return 'Queued';
			case 'Failed':
				return duration ? `Failed after ${duration}` : 'Failed';
			default:
				return duration ? `Completed in ${duration}` : 'Completed';
		}
	}

	private formatChangesLabel(job: job): string {
		if (job.changeCount <= 0 && job.newVersionCount <= 0) {
			return 'No changes detected';
		}
		const parts: string[] = [];
		if (job.changeCount > 0) {
			parts.push(`${job.changeCount} change${job.changeCount === 1 ? '' : 's'}`);
		}
		if (job.newVersionCount > 0) {
			parts.push(`${job.newVersionCount} new version${job.newVersionCount === 1 ? '' : 's'}`);
		}
		return parts.join(', ');
	}

	public async onManualRefresh(): Promise<void> {
		await this.fetchAndApply(true);
	}

	/** Full load with a busy spinner — used on entry and manual refresh. */
	private async loadDashboard(): Promise<void> {
		await this.fetchAndApply(true);
	}

	/** Silent 60s poll — no spinner, no error dialogs; reuses cached change summaries. */
	private async refreshLight(): Promise<void> {
		await this.fetchAndApply(false);
	}

	private async fetchAndApply(showBusy: boolean): Promise<void> {
		const model = this.getModel('home') as JSONModel;
		if (showBusy) {
			model.setProperty('/busy', true);
		}
		try {
			const component = this.getOwnerComponent();
			const [registries, jobs, logs] = await Promise.all([
				component.getRegistryService().getRegistries({
					search: '',
					searchField: 'all',
					status: 'All',
					groupType: 'All',
					registryName: '',
					createdBy: ''
				}),
				component.getJobService().getJobs(),
				this.loadRecentLogs()
			]);

			const recentRegistries = this.sortByDateDesc(registries, (registry) => registry.lastChangeAt.slice(0, RECENT_LIMIT));
			const recentRegistryCards = await this.attachChangeSummaries(recentRegistries);
			const attentionItems = this.computeAttentionItems(registries, jobs);

			model.setProperty('/registryStats', this.computeRegistryStats(registries));
			model.setProperty('/kpiDelta', this.computeKpiDelta(registries));
			model.setProperty('/recentRegistries', recentRegistryCards);
			model.setProperty('/activity', this.buildActivity(jobs, logs));
			const scanActivity = this.bucketScanTrend(jobs);
			model.setProperty('/scanTrend', scanActivity.points);
			model.setProperty('/scanSummary', scanActivity.summary);
			model.setProperty('/attentionItems', attentionItems);
			model.setProperty('/attentionCount', attentionItems.length);
			model.setProperty('/lastUpdated', new Date().toISOString());
		} catch (error) {
			// The silent poll must not pop error dialogs for transient failures.
			if (showBusy) {
				await this.handleServiceError(error);
			}
		} finally {
			if (showBusy) {
				model.setProperty('/busy', false);
			}
		}
	}

	/** Logs are supplementary — a failure here must not blank out the whole dashboard. */
	private async loadRecentLogs(): Promise<logEntry[]> {
		try {
			const page = await this.getOwnerComponent().getLogService().getLogs({ top: ACTIVITY_LOG_FETCH });
			return page.items;
		} catch {
			return [];
		}
	}

	private computeKpiDelta(registries: registry[]): KpiDelta {
		const now = Date.now();
		const withinWindow = (value: string): boolean => {
			const time = new Date(value).getTime();
			return Number.isFinite(time) && now - time <= STALE_THRESHOLD_MS;
		};

		return registries.reduce<KpiDelta>(
			(delta, registry) => {
				if (withinWindow(registry.registeredAt)) {
					delta.totalNew += 1;
				}
				if (withinWindow(registry.lastChangeAt)) {
					if (registry.status === 'Published') {
						delta.publishedChanged += 1;
					} else if (registry.status === 'Unpublished') {
						delta.unpublishedChanged += 1;
					} else if (registry.status === 'Archive') {
						delta.archiveChanged += 1;
					}
				}
				return delta;
			},
			{ totalNew: 0, publishedChanged: 0, unpublishedChanged: 0, archiveChanged: 0 }
		);
	}

	/** Merges scan jobs and audit logs into one time-ordered feed, de-duping scan-job log rows. */
	private buildActivity(jobs: job[], logs: logEntry[]): ActivityItem[] {
		const rows: Array<{ ts: number; item: ActivityItem }> = [];
		const jobIds = new Set<string>();

		for (const job of jobs) {
			jobIds.add(this.normalizeId(job.scanJobId));
			rows.push({
				ts: new Date(job.startedAt).getTime(),
				item: {
					icon: 'sap-icon://activity-items',
					title: this.formatJobTitle(job),
					subtitle: this.formatJobSubtitle(job),
					timeAgo: this.formatRelativeTime(job.startedAt),
					state: this.formatStatusState(job.status),
					kind: 'job',
					objectIdType: 'SCANJOB',
					objectId: job.scanJobId
				}
			});
		}

		for (const log of logs) {
			// Skip scan-job log rows already shown as a richer job row above.
			if ((log.objectIdType || '').toUpperCase() === 'SCANJOB' && jobIds.has(this.normalizeId(log.objectId))) {
				continue;
			}
			rows.push({
				ts: new Date(log.actionAt).getTime(),
				item: {
					icon: this.activityLogIcon(log.objectIdType),
					title: log.actionText || log.actionType || 'Activity',
					subtitle: this.buildLogSubtitle(log),
					timeAgo: this.formatRelativeTime(log.actionAt),
					state: this.logResultState(log.logResult),
					kind: 'log',
					objectIdType: log.objectIdType,
					objectId: log.objectId
				}
			});
		}

		return rows
			.filter((row) => Number.isFinite(row.ts))
			.sort((left, right) => right.ts - left.ts)
			.slice(0, ACTIVITY_LIMIT)
			.map((row) => row.item);
	}

	public onActivityPress(event: UI5Event): void {
		const item = this.getEntityFromEvent<ActivityItem>(event);
		if (!item) {
			return;
		}
		void this.navigateToActivity(item);
	}

	/** Routes an activity row to its object, mirroring Logs.onNavigateToObject. */
	private async navigateToActivity(item: ActivityItem): Promise<void> {
		const type = (item.objectIdType || '').toUpperCase();
		const objectId = item.objectId;

		if (item.kind === 'job' || type === 'SCANJOB') {
			if (objectId) {
				this.navTo('jobDetail', { jobId: objectId });
			}
			return;
		}
		if (!objectId) {
			return;
		}
		if (type === 'REGISTRY') {
			this.navTo('registryDetail', { registryId: objectId });
			return;
		}

		try {
			if (type === 'VERSION') {
				const version = await this.getOwnerComponent().getVersionService().getVersion(objectId);
				if (version.groupId) {
					this.navTo('versionDetail', { registryId: version.groupId, versionId: objectId });
				}
				return;
			}
			if (type === 'DETAIL') {
				const detail = await this.getOwnerComponent().getDetailService().getDetail(objectId);
				if (detail.groupId && detail.versionId) {
					this.navTo('versionDetail', { registryId: detail.groupId, versionId: detail.versionId, query: { detailId: objectId } });
				}
			}
		} catch (error) {
			await this.handleServiceError(error);
		}
	}

	/** 14 daily buckets (oldest → newest) of scan-job counts, plus summary stats, for the activity chart. */
	private bucketScanTrend(jobs: job[]): { points: ScanTrendPoint[]; summary: ScanTrendSummary } {
		const now = new Date();
		const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const counts = new Array<number>(SCAN_TREND_DAYS).fill(0);

		for (const job of jobs) {
			const time = new Date(job.startedAt).getTime();
			if (!Number.isFinite(time)) {
				continue;
			}
			const jobDate = new Date(time);
			const jobDayStart = new Date(jobDate.getFullYear(), jobDate.getMonth(), jobDate.getDate()).getTime();
			const dayOffset = Math.round((startOfToday - jobDayStart) / DAY_MS);
			if (dayOffset >= 0 && dayOffset < SCAN_TREND_DAYS) {
				counts[dayOffset] += 1;
			}
		}

		const maxValue = Math.max(1, ...counts);
		const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
		const fullFormat = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' });

		const points: ScanTrendPoint[] = [];
		let total = 0;
		let peakValue = 0;
		let peakOffset = 0;
		for (let offset = SCAN_TREND_DAYS - 1; offset >= 0; offset--) {
			const value = counts[offset];
			const dayStart = startOfToday - offset * DAY_MS;
			total += value;
			if (value > peakValue) {
				peakValue = value;
				peakOffset = offset;
			}

			const isToday = offset === 0;
			const state: ScanTrendPoint['state'] = value === 0 ? 'empty' : isToday ? 'today' : 'normal';
			// Non-zero bars keep a legible minimum height; empty days show a faint baseline stub.
			const heightPct = value === 0 ? 6 : Math.max(14, Math.round((value / maxValue) * 100));
			const scanWord = value === 1 ? 'scan' : 'scans';
			const dayName = isToday ? 'Today' : fullFormat.format(new Date(dayStart));
			points.push({
				label: dateFormat.format(new Date(dayStart)),
				value,
				heightPct,
				state,
				tooltip: `${dayName} — ${value} ${scanWord}`
			});
		}

		const summary: ScanTrendSummary = {
			total,
			peakValue,
			peakLabel: peakValue > 0 ? dateFormat.format(new Date(startOfToday - peakOffset * DAY_MS)) : '',
			startLabel: dateFormat.format(new Date(startOfToday - (SCAN_TREND_DAYS - 1) * DAY_MS)),
			endLabel: 'Today'
		};

		return { points, summary };
	}

	private normalizeId(value: string): string {
		return (value || '').replace(/[{}]/g, '').trim().toLowerCase();
	}

	private buildLogSubtitle(log: logEntry): string {
		const actor = log.actor || 'system';
		const scope = (log.objectIdType || '').trim();
		const base = scope ? `${actor} · ${this.capitalize(scope.toLowerCase())}` : actor;
		const remarks = (log.remarks || '').trim();
		return remarks ? `${base} · ${remarks}` : base;
	}

	private activityLogIcon(objectIdType: string): string {
		switch ((objectIdType || '').toUpperCase()) {
			case 'REGISTRY':
				return 'sap-icon://database';
			case 'VERSION':
				return 'sap-icon://history';
			case 'DETAIL':
				return 'sap-icon://document';
			case 'SCANJOB':
				return 'sap-icon://activity-items';
			default:
				return 'sap-icon://bell';
		}
	}

	private logResultState(result: string): ActivityState {
		const normalized = (result || '').toUpperCase();
		if (normalized === 'S' || normalized === 'SUCCESS') {
			return 'Success';
		}
		if (normalized === 'F' || normalized === 'E' || normalized === 'ERROR' || normalized.startsWith('FAIL')) {
			return 'Error';
		}
		return 'None';
	}

	private computeRegistryStats(registries: registry[]): RegistryStats {
		return registries.reduce<RegistryStats>(
			(stats, registry) => {
				stats.total += 1;
				if (registry.status === 'Published') {
					stats.published += 1;
				} else if (registry.status === 'Unpublished') {
					stats.unpublished += 1;
				} else if (registry.status === 'Archive') {
					stats.archive += 1;
				}
				return stats;
			},
			{ total: 0, published: 0, unpublished: 0, archive: 0 }
		);
	}

	private computeAttentionItems(registries: registry[], jobs: job[]): AttentionItem[] {
		const items: AttentionItem[] = [];
		const now = Date.now();

		const staleRegistries = registries.filter((registry) => {
			if (registry.status === 'Archive') {
				return false;
			}
			const lastChanged = new Date(registry.lastChangeAt).getTime();
			return Number.isFinite(lastChanged) && now - lastChanged > STALE_THRESHOLD_MS;
		});
		if (staleRegistries.length > 0) {
			const count = staleRegistries.length;
			items.push({
				icon: 'sap-icon://history',
				text: `${count} metadata source${count === 1 ? '' : 's'} ${count === 1 ? 'has' : 'have'} not been updated in over 7 days`,
				state: 'Warning',
				action: 'registries'
			});
		}

		const undocumentedRegistries = registries.filter((registry) => registry.status !== 'Archive' && !(registry.description ?? '').trim());
		if (undocumentedRegistries.length > 0) {
			const count = undocumentedRegistries.length;
			items.push({
				icon: 'sap-icon://documents',
				text: count === 1 ? '1 registry is missing a description' : `${count} registries are missing a description`,
				state: 'Warning',
				action: 'registries'
			});
		}

		const recentFailedJobs = jobs.filter((job) => {
			if (job.status !== 'Failed') {
				return false;
			}
			const startedAt = new Date(job.startedAt).getTime();
			return Number.isFinite(startedAt) && now - startedAt <= STALE_THRESHOLD_MS;
		});
		if (recentFailedJobs.length > 0) {
			const count = recentFailedJobs.length;
			items.push({
				icon: 'sap-icon://alert',
				text: `${count} scan job${count === 1 ? '' : 's'} failed in the last 7 days`,
				state: 'Error',
				action: 'jobs'
			});
		}

		return items;
	}

	/**
	 * Attaches a change summary to each registry. To keep the 60s poll cheap, a
	 * cached summary is reused whenever the registry's lastChangedAt is unchanged;
	 * only genuinely-changed registries trigger a fresh getVersions call.
	 */
	private async attachChangeSummaries(registries: registry[]): Promise<RegistryCard[]> {
		const versionService = this.getOwnerComponent().getVersionService();
		const cards = await Promise.all(
			registries.map(async (registry) => {
				const cached = this.summaryCache.get(registry.groupId);
				if (cached && cached.lastChangedAt === registry.lastChangeAt) {
					return { ...registry, changeSummary: cached.summary };
				}

				try {
					const versions = await versionService.getVersions(registry.groupId);
					const summary = this.buildChangeSummary(versions);
					this.summaryCache.set(registry.groupId, { lastChangedAt: registry.lastChangeAt, summary });
					return { ...registry, changeSummary: summary };
				} catch {
					return { ...registry, changeSummary: this.emptyChangeSummary() };
				}
			})
		);

		// Bound cache memory to the registries currently on screen.
		const visibleIds = new Set(registries.map((registry) => registry.groupId));
		for (const id of [...this.summaryCache.keys()]) {
			if (!visibleIds.has(id)) {
				this.summaryCache.delete(id);
			}
		}
		return cards;
	}

	private emptyChangeSummary(): RegistryChangeSummary {
		return { headline: 'Change history unavailable', breaking: false, hasBaseline: false, details: [] };
	}

	/** Diffs the two most recent versions' metadata (name-level only — no type/annotation detail is captured here). */
	private buildChangeSummary(versions: registryVersion[]): RegistryChangeSummary {
		const sorted = [...versions].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
		const [latest, previous] = sorted;

		if (!latest || !previous) {
			return { headline: 'No prior version to compare yet', breaking: false, hasBaseline: false, details: [] };
		}

		const details: ChangeDetail[] = [];
		const groups: ChangeGroup[] = [];

		const entitiesBefore = new Set([...previous.metadata.entityTypes, ...previous.metadata.entitySets]);
		const entitiesAfter = new Set([...latest.metadata.entityTypes, ...latest.metadata.entitySets]);
		this.diffCategory(entitiesBefore, entitiesAfter, 'entity', details, groups);

		for (const { key, noun } of DIFF_CATEGORIES) {
			const before = new Set(previous.metadata[key]);
			const after = new Set(latest.metadata[key]);
			this.diffCategory(before, after, noun, details, groups);
		}

		const breaking = details.some((detail) => detail.severity === 'Breaking');
		const headline =
			groups.length === 0
				? 'No structural changes since last scan'
				: [...groups]
					.sort((left, right) => right.count - left.count)
					.slice(0, 3)
					.map((group) => `${group.count} ${this.pluralizeNoun(group.noun, group.count)} ${group.verb}`)
					.join(' · ');

		return { headline, breaking, hasBaseline: true, details };
	}

	private diffCategory(before: Set<string>, after: Set<string>, noun: string, details: ChangeDetail[], groups: ChangeGroup[]): void {
		const added = [...after].filter((value) => !before.has(value));
		const removed = [...before].filter((value) => !after.has(value));

		if (added.length > 0) {
			groups.push({ noun, verb: 'added', count: added.length });
			for (const name of added) {
				details.push({ text: `${this.capitalize(noun)} added: ${name}`, severity: 'Compatible' });
			}
		}
		if (removed.length > 0) {
			groups.push({ noun, verb: 'removed', count: removed.length });
			for (const name of removed) {
				details.push({ text: `${this.capitalize(noun)} removed: ${name}`, severity: 'Breaking' });
			}
		}
	}

	private pluralizeNoun(noun: string, count: number): string {
		if (count === 1) {
			return noun;
		}
		if (/[^aeiou]y$/.test(noun)) {
			return `${noun.slice(0, -1)}ies`;
		}
		if (/(s|x|z|ch|sh)$/.test(noun)) {
			return `${noun}es`;
		}
		return `${noun}s`;
	}

	private capitalize(text: string): string {
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	private sortByDateDesc<T>(items: T[], getDate: (item: T) => string): T[] {
		return [...items].sort((left, right) => new Date(getDate(right)).getTime() - new Date(getDate(left)).getTime());
	}

	private getEntityFromEvent<T>(event: UI5Event): T | null {
		const source = event.getSource() as unknown as { getBindingContext: (name?: string) => { getObject: () => T } | null };
		const context = source.getBindingContext('home');
		return context?.getObject() ?? null;
	}
}
