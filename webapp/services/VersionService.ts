import ODataClient from './ODataClient';
import ServiceError from './ServiceError';
import { readMockData } from './MockStore';
import type { MetadataDetails, RegistryVersion, VersionDifference } from '../model/types';
import { mapVersionEntity, normalizeODataCollection, normalizeODataEntity } from './ODataParsers';
import DetailService from './DetailService';

function delay<T>(value: T, ms = 250): Promise<T> {
	return new Promise((resolve) => {
		setTimeout(() => resolve(value), ms);
	});
}

function toLabelList(items: string[], prefix: string): string[] {
	return items.map((item) => `${prefix}: ${item}`);
}

function compareLists(left: string[], right: string[]): VersionDifference {
	const leftSet = new Set(left);
	const rightSet = new Set(right);
	const added = right.filter((item) => !leftSet.has(item));
	const removed = left.filter((item) => !rightSet.has(item));
	const unchanged = left.filter((item) => rightSet.has(item));
	const modified = left.filter((item, index) => right[index] && right[index] !== item);
	return { added, removed, modified, unchanged };
}

function normalizeGuid(value: string): string {
	return value.replace(/[{}]/g, '').trim();
}

function formatGuidLiteral(value: string): string {
	return normalizeGuid(value);
}

function asString(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	return String(value);
}

export interface VersionComparisonLine {
	label: string;
	left: string;
	right: string;
	status: 'added' | 'removed' | 'modified' | 'unchanged';
}

export interface VersionComparisonResult {
	structured: VersionComparisonLine[];
	rawLeft: string;
	rawRight: string;
	rawDiff: VersionComparisonLine[];
	summary: VersionDifference;
}

export default class VersionService {
	private readonly client = new ODataClient();

	public constructor(private readonly detailService: DetailService) {}

	public async getVersions(registryId: string): Promise<RegistryVersion[]> {
		try {
			const backendVersions = await this.loadVersionsFromBackend(registryId);
			if (backendVersions.length > 0) {
				return delay(backendVersions);
			}
		} catch {
			// Fall back to mock data below.
		}

		const data = readMockData();
		const registry = data.registries.find((item) => item.id === registryId);
		if (!registry) {
			throw new ServiceError(404, 'Registry not found.');
		}

		return delay(
			registry.versions.map((version) => ({
				...version,
				metadata: { ...version.metadata }
			}))
		);
	}

	public async getVersion(versionId: string): Promise<RegistryVersion> {
		try {
			const backendVersion = await this.loadVersionFromBackend(versionId);
			if (backendVersion) {
				return delay(backendVersion);
			}
		} catch {
			// Fall back to mock data below.
		}

		const data = readMockData();
		for (const registry of data.registries) {
			const version = registry.versions.find((item) => item.id === versionId);
			if (version) {
				return delay({
					...version,
					metadata: { ...version.metadata }
				});
			}
		}

		throw new ServiceError(404, 'Version not found.');
	}

	public async compareVersions(leftVersionId: string, rightVersionId: string): Promise<VersionComparisonResult> {
		const [left, right] = await Promise.all([
			this.getVersion(leftVersionId),
			this.getVersion(rightVersionId)
		]);
		const categories: Array<keyof MetadataDetails> = [
			'entityTypes',
			'entitySets',
			'properties',
			'navigationProperties',
			'functionImports',
			'actions',
			'complexTypes'
		];

		const structured: VersionComparisonLine[] = categories.flatMap((category) => {
			const leftValue = left.metadata[category].join(', ');
			const rightValue = right.metadata[category].join(', ');
			const status: VersionComparisonLine['status'] = leftValue === rightValue ? 'unchanged' : 'modified';
			return [
				{
					label: category,
					left: leftValue,
					right: rightValue,
					status
				}
			];
		});

		const leftLines = left.xml.split(/\r?\n/);
		const rightLines = right.xml.split(/\r?\n/);
		const maxLength = Math.max(leftLines.length, rightLines.length);
		const rawDiff: VersionComparisonLine[] = Array.from({ length: maxLength }, (_, index) => {
			const leftLine = leftLines[index] ?? '';
			const rightLine = rightLines[index] ?? '';
			let status: VersionComparisonLine['status'] = 'unchanged';
			if (leftLine && !rightLine) {
				status = 'removed';
			} else if (!leftLine && rightLine) {
				status = 'added';
			} else if (leftLine !== rightLine) {
				status = 'modified';
			}

			return {
				label: String(index + 1),
				left: leftLine,
				right: rightLine,
				status
			};
		});

		return delay({
			structured,
			rawLeft: left.xml,
			rawRight: right.xml,
			rawDiff,
			summary: compareLists(
				toLabelList(left.metadata.properties, 'Property'),
				toLabelList(right.metadata.properties, 'Property')
			)
		});
	}

	private async loadVersionsFromBackend(registryId: string): Promise<RegistryVersion[]> {
		const payload = await this.client.readJson(`/Registry/${formatGuidLiteral(registryId)}/_Version`);
		const versions = normalizeODataCollection(payload);
		return Promise.all(versions.map((entity) => this.loadVersionFromEntity(entity)));
	}

	private async loadVersionFromBackend(versionId: string): Promise<RegistryVersion | null> {
		const payload = await this.client.readJson(`/Version/${formatGuidLiteral(versionId)}`);
		const entity = normalizeODataEntity(payload);
		if (!Object.keys(entity).length) {
			return null;
		}

		return this.loadVersionFromEntity(entity);
	}

	private async loadVersionFromEntity(entity: Record<string, any>): Promise<RegistryVersion> {
		const versionId = asString(entity.VersionId) || asString(entity.id);
		let parsedDetail: { detailId: string; metadataXml: string } | undefined;
		try {
			const details = await this.detailService.getDetails(versionId);
			const primaryDetail = details[0];
			if (primaryDetail) {
				parsedDetail = await this.detailService.getParsedDetail(primaryDetail.id);
			}
		} catch {
			parsedDetail = undefined;
		}

		return mapVersionEntity(entity, parsedDetail);
	}
}
