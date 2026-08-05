# types.ts Rename Summary

This document lists all naming changes applied to `types.ts`, aligning it with the backend model `ComSapGatewaySrvdA2xZsrRegistryV0001Model.ts`.

## 1. Type / Interface Names (PascalCase → camelCase)

| Old name | New name |
|---|---|
| `RegistryStatus` | `registryStatus` |
| `JobStatus` | `jobStatus` |
| `MetadataDetails` | `metadataDetails` |
| `VersionDifference` | `versionDifference` |
| `RegistryVersion` | `registryVersion` |
| `RegistryDetail` | `registryDetail` |
| `Registry` | `registry` |
| `Job` | `job` |
| `LogEntry` | `logEntry` |
| `SessionData` | `sessionData` |
| `RegistryInput` | `registryInput` |
| `RegistryCreateInput` | `registryCreateInput` |
| `RegistryUpdateInput` | `registryUpdateInput` |
| `RegistryValueHelpItem` | `registryValueHelpItem` |
| `JobRunInput` | `jobRunInput` |
| `RegistryFilterState` | `registryFilterState` |
| `MetadataSearchResult` | `metadataSearchResult` |
| `DetailMetadataResult` | `detailMetadataResult` |
| `XmlLineEntry` | `xmlLineEntry` |
| `VersionActionResult` | `versionActionResult` |
| `VersionCompareActionEntry` | `versionCompareActionEntry` |
| `VersionCompareActionResult` | `versionCompareActionResult` |
| `NodeTreeAttribute` | `nodeTreeAttribute` |
| `NodeTreeResponseItem` | `nodeTreeResponseItem` |
| `NodeTreeViewItem` | `nodeTreeViewItem` |
| `NodeTreeActionResult` | `nodeTreeActionResult` |
| `NodeDiffAttribute` | `nodeDiffAttribute` |
| `NodeDiffEntry` | `nodeDiffEntry` |
| `NodeDiffActionResult` | `nodeDiffActionResult` |
| `CompareVersionEntry` | `compareVersionEntry` |
| `CompareVersionResult` | `compareVersionResult` |
| `DetailId` | `detailId` |
| `SendMailParams` | `sendMailParams` |
| `SendMailResult` | `sendMailResult` |

All usages of these names elsewhere in the file (property types, `extends` clauses, array types, `keyof` expressions) were updated to match.

## 2. Property Names (aligned with backend model field names, converted to camelCase)

| Interface | Old property | New property |
|---|---|---|
| `registry` | `id` | `groupId` |
| `registry` | `registryName` | `groupName` |
| `registry` | `serviceType` | `groupType` |
| `registry` | `createdBy` | `registeredBy` |
| `registry` | `createdAt` | `registeredAt` |
| `registry` | `lastChangedAt` | `lastChangeAt` |
| `registryVersion` | `id` | `versionId` |
| `registryVersion` | `versionNumber` | `versionNo` |
| `registryVersion` | `xml` | `metadataXml` |
| `registryDetail` | `id` | `detailId` |
| `registryDetail` | `serviceDefinition` | `serviceDefId` |
| `registryDetail` | `lastChangedAt` | `lastChangeAt` |
| `registryDetail` | `xml` | `metadataXml` |
| `job` | `id` | `scanJobId` |
| `job` | `executedBy` | `triggeredBy` |
| `logEntry` | `id` | `logId` |
| `registryInput` | `registryName` | `groupName` |
| `registryInput` | `serviceType` | `groupType` |
| `registryFilterState` | `registryName` | `groupName` |
| `registryFilterState` | `createdBy` | `registeredBy` |
| `jobRunInput` | `registryId` | `groupId` |
| `versionActionResult` | `CreatedAt` | `createdAt` |
| `versionActionResult` | `CreatedBy` | `createdBy` |
| `versionActionResult` | `GroupHash` | `groupHash` |
| `versionActionResult` | `GroupId` | `groupId` |
| `versionActionResult` | `LatestVersion` | `latestVersion` |
| `versionActionResult` | `Status` | `status` |
| `versionActionResult` | `TriggerType` | `triggerType` |
| `versionActionResult` | `VersionId` | `versionId` |
| `versionActionResult` | `VersionNo` | `versionNo` |
| `versionCompareActionEntry` | `SERVICEDEFID` | `serviceDefId` |
| `versionCompareActionEntry` | `BASEDETAILID` | `baseDetailId` |
| `versionCompareActionEntry` | `COMPAREDETAILID` | `compareDetailId` |
| `versionCompareActionEntry` | `CHANGETYPE` | `changeType` |
| `versionCompareActionResult` | `BASEVERSIONID` | `baseVersionId` |
| `versionCompareActionResult` | `COMPAREVERSIONID` | `compareVersionId` |
| `versionCompareActionResult` | `CHANGE` | `change` |
| `versionCompareActionResult` | `DIFFER` | `differ` |
| `versionCompareActionResult` | `UNCHANGE` | `unchange` |
| `nodeTreeActionResult` | `NODETREE` | `nodeTree` |
| `nodeDiffAttribute` | `SEMANTIC_ID` | `semanticId` |
| `nodeDiffAttribute` | `NAME` | `name` |
| `nodeDiffAttribute` | `STATUS` | `status` |
| `nodeDiffAttribute` | `OLD_VALUE` | `oldValue` |
| `nodeDiffAttribute` | `NEW_VALUE` | `newValue` |
| `nodeDiffEntry` | `SEMANTIC_ID` | `semanticId` |
| `nodeDiffEntry` | `STATUS` | `status` |
| `nodeDiffEntry` | `ATTRIBUTEDIFF` | `attributeDiff` |
| `nodeDiffActionResult` | `NODEDIFF` | `nodeDiff` |
| `detailId` | `DetailId` | `detailId` |

## 3. Left Unchanged (no clear backend counterpart)

`etag`, `durationMs`, `errorMessage`, `summary`, `comment`, `metadata`, `logs`

## Note

TypeScript convention is PascalCase for type/interface names. Renaming them to camelCase (section 1) can collide with variable names in consuming code (e.g. `const job: job = ...` is invalid). Consider reverting section 1 back to PascalCase while keeping property names camelCase, if this causes issues downstream.
