import type { Job, MetadataDetails, Registry, RegistryDetail, RegistryVersion } from "../model/types";

type ODataRecord = Record<string, any>;

export function emptyMetadata(): MetadataDetails {
	return {
		entityTypes: [],
		entitySets: [],
		properties: [],
		navigationProperties: [],
		functionImports: [],
		actions: [],
		complexTypes: []
	};
}

export function normalizeODataCollection(payload: unknown): ODataRecord[] {
	if (Array.isArray(payload)) {
		return payload as ODataRecord[];
	}

	if (!payload || typeof payload !== "object") {
		return [];
	}

	const record = payload as ODataRecord;
	if (Array.isArray(record.value)) {
		return record.value as ODataRecord[];
	}

	if (record.d && Array.isArray(record.d.results)) {
		return record.d.results as ODataRecord[];
	}

	return [];
}

export function normalizeODataEntity(payload: unknown): ODataRecord {
	if (!payload || typeof payload !== "object") {
		return {};
	}

	const record = payload as ODataRecord;
	if (record.d && typeof record.d === "object" && !Array.isArray(record.d)) {
		return record.d as ODataRecord;
	}

	if (record.value && typeof record.value === "object" && !Array.isArray(record.value)) {
		return record.value as ODataRecord;
	}

	return record;
}

function asString(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}

	return String(value);
}

function asIsoDate(value: unknown): string {
	if (!value) {
		return new Date().toISOString();
	}

	const date = new Date(String(value));
	return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mapRegistryStatus(code: unknown, text: unknown): Registry["status"] {
	const normalizedText = asString(text).toLowerCase();
	if (normalizedText.includes("publish") || normalizedText.includes("active")) {
		return "Publish";
	}
	if (normalizedText.includes("unpublish") || normalizedText.includes("inactive") || normalizedText.includes("unassigned")) {
		return "Unpublish";
	}
	if (normalizedText.includes("archive")) {
		return "Archive";
	}

	const normalizedCode = asString(code).trim().toUpperCase();
	switch (normalizedCode) {
		case "P":
			return "Publish";
		case "U":
			return "Unpublish";
		case "A":
			return "Archive";
		default:
			return "Unpublish";
	}
}

function mapJobStatus(code: unknown, text: unknown, fallback: Job["status"]): Job["status"] {
	const normalizedText = asString(text).toLowerCase();
	if (normalizedText.includes("running")) {
		return "Running";
	}
	if (normalizedText.includes("completed") || normalizedText.includes("success")) {
		return "Completed";
	}
	if (normalizedText.includes("failed") || normalizedText.includes("error")) {
		return "Failed";
	}
	if (normalizedText.includes("queued") || normalizedText.includes("pending")) {
		return "Queued";
	}

	const normalizedCode = asString(code).trim().toUpperCase();
	switch (normalizedCode) {
		case "R":
			return "Running";
		case "C":
			return "Completed";
		case "F":
			return "Failed";
		default:
			return fallback;
	}
}

function getMetadataXml(detail: ODataRecord | undefined): string {
	if (!detail) {
		return "";
	}

	const raw = detail.MetadataXml ?? detail.metadataXml ?? detail.Metadata ?? detail.metadata ?? "";
	const text = asString(raw);
	if (!text) {
		return "";
	}

	if (text.includes("<")) {
		return text;
	}

	try {
		if (typeof atob === "function") {
			const decoded = atob(text);
			return decoded.includes("<") ? decoded : text;
		}
	} catch {
		// Ignore base64 decoding errors and fall through.
	}

	return text;
}

function pushUnique(target: string[], value: unknown): void {
	const text = asString(value).trim();
	if (text && !target.includes(text)) {
		target.push(text);
	}
}

export function parseMetadataXml(xml: string): MetadataDetails {
	if (!xml || !xml.includes("<")) {
		return emptyMetadata();
	}

	try {
		const parser = new DOMParser();
		const document = parser.parseFromString(xml, "application/xml");
		if (document.querySelector("parsererror")) {
			return emptyMetadata();
		}

		const metadata = emptyMetadata();
		for (const node of Array.from(document.getElementsByTagName("EntityType"))) {
			pushUnique(metadata.entityTypes, node.getAttribute("Name"));
			for (const property of Array.from(node.getElementsByTagName("Property"))) {
				pushUnique(metadata.properties, property.getAttribute("Name"));
			}
			for (const navigation of Array.from(node.getElementsByTagName("NavigationProperty"))) {
				pushUnique(metadata.navigationProperties, navigation.getAttribute("Name"));
			}
		}

		for (const node of Array.from(document.getElementsByTagName("EntitySet"))) {
			pushUnique(metadata.entitySets, node.getAttribute("Name"));
		}

		for (const node of Array.from(document.getElementsByTagName("FunctionImport"))) {
			pushUnique(metadata.functionImports, node.getAttribute("Name"));
		}

		for (const node of Array.from(document.getElementsByTagName("Action"))) {
			pushUnique(metadata.actions, node.getAttribute("Name"));
		}

		for (const node of Array.from(document.getElementsByTagName("ComplexType"))) {
			pushUnique(metadata.complexTypes, node.getAttribute("Name"));
		}

		return metadata;
	} catch {
		return emptyMetadata();
	}
}

export function mapRegistryEntity(entity: ODataRecord, options: { versions?: RegistryVersion[]; serviceDefinition?: string } = {}): Registry {
	const status = mapRegistryStatus(entity.Status, entity.StatusText);
	const serviceType = asString(entity.GroupTypeText) || asString(entity.GroupType);
	const registryName = asString(entity.GroupName) || asString(entity.registryName) || asString(entity.Name) || asString(entity.GroupId);

	return {
		id: asString(entity.GroupId) || asString(entity.id),
		registryName,
		serviceName: registryName,
		serviceType: serviceType || "RAP",
		status,
		description: asString(entity.Description),
		createdBy: asString(entity.RegisteredBy) || asString(entity.CreatedBy) || "",
		createdAt: asIsoDate(entity.RegisteredAt ?? entity.CreatedAt),
		lastChangedBy: asString(entity.LastChangedBy) || asString(entity.RegisteredBy) || asString(entity.CreatedBy) || "",
		lastChangedAt: asIsoDate(entity.LastChangeAt ?? entity.TotalLastChangeAt ?? entity.RegisteredAt ?? entity.CreatedAt),
		serviceDefinition: options.serviceDefinition ?? asString(entity.ServiceDefId) ?? "",
		versions: options.versions ?? []
	};
}

export function mapVersionEntity(entity: ODataRecord, detailEntity?: ODataRecord): RegistryVersion {
	const xml = getMetadataXml(detailEntity);
	const metadata = xml ? parseMetadataXml(xml) : emptyMetadata();
	const comment = asString(entity.TriggerText) || asString(entity.StatusText) || asString(entity.GroupHash);

	return {
		id: asString(entity.VersionId) || asString(entity.id),
		groupId: asString(entity.GroupId),
		versionNumber: asString(entity.VersionNo) || asString(entity.versionNumber) || "1.0.0",
		createdBy: asString(entity.CreatedBy) || "",
		createdAt: asIsoDate(entity.CreatedAt ?? entity.LastChangeAt),
		comment,
		metadata,
		xml
	};
}

export function mapDetailEntity(entity: ODataRecord): RegistryDetail {
	return {
		id: asString(entity.DetailId) || asString(entity.id),
		versionId: asString(entity.VersionId),
		groupId: asString(entity.GroupId),
		serviceDefinition: asString(entity.ServiceDefId),
		serviceHash: asString(entity.ServiceHash),
		lastChangedAt: asIsoDate(entity.LastChangeAt),
		xml: getMetadataXml(entity)
	};
}

export function mapJobEntity(entity: ODataRecord): Job {
	const startedAt = asIsoDate(entity.StartedAt);
	const finishedAtValue = entity.FinishedAt ? asIsoDate(entity.FinishedAt) : null;
	const status = mapJobStatus(entity.Status, entity.StatusText, "Completed");

	return {
		id: asString(entity.ScanJobId) || asString(entity.id),
		registryId: asString(entity.TotalRegistry) || asString(entity.GroupId) || asString(entity.ScanJobId) || "",
		registryName: `Scan Job ${asString(entity.TriggerType) || asString(entity.TriggeredBy) || ""}`.trim(),
		status,
		startedAt,
		finishedAt: finishedAtValue,
		durationMs: finishedAtValue ? new Date(finishedAtValue).getTime() - new Date(startedAt).getTime() : null,
		executedBy: asString(entity.TriggeredBy) || "",
		logs: [
			`[INFO] Trigger type: ${asString(entity.TriggerType) || "unknown"}`,
			`[INFO] Total registries: ${asString(entity.TotalRegistry) || "0"}`,
			`[INFO] Changes: ${asString(entity.ChangeCount) || "0"}, New versions: ${asString(entity.NewVersionCount) || "0"}`
		],
		errorMessage: status === "Failed" ? "The scan job failed on the backend." : "",
		summary:
			status === "Failed"
				? "Scan completed with errors."
				: status === "Running"
					? "Scan job is running."
					: "Scan job completed successfully."
	};
}
