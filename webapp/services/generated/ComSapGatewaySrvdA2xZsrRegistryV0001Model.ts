// @ts-nocheck

export interface ScanJobType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ScanJobId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    ScanJobId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TriggerType` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    TriggerType: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `StartedAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    StartedAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `FinishedAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    FinishedAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Status` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Status: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TotalRegistry` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    TotalRegistry: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ChangeCount` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    ChangeCount: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NewVersionCount` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    NewVersionCount: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TriggeredBy` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    TriggeredBy: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SAP__Messages` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.SAP__Message)` |
     * | Nullable | `false` |
     */
    SAP__Messages: Array<SAP__Message>;
}

export type ScanJobTypeId = string | { ScanJobId: string };

export interface EditableScanJobType extends Pick<ScanJobType, "TriggerType" | "Status" | "TotalRegistry" | "ChangeCount" | "NewVersionCount" | "TriggeredBy">, Partial<Pick<ScanJobType, "StartedAt" | "FinishedAt">> {
    SAP__Messages: Array<EditableSAP__Message>;
}

export interface VersionType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `VersionId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    VersionId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    GroupId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `VersionNo` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    VersionNo: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupHash` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    GroupHash: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Status` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Status: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `StatusText` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    StatusText: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `CreatedBy` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    CreatedBy: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `CreatedAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    CreatedAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TriggerType` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    TriggerType: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TriggerText` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    TriggerText: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `LatestVersion` |
     * | Type | `Edm.Boolean` |
     * | Nullable | `false` |
     */
    LatestVersion: boolean;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `LastChangeAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    LastChangeAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SAP__Messages` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.SAP__Message)` |
     * | Nullable | `false` |
     */
    SAP__Messages: Array<SAP__Message>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_Detail` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.DetailType)` |
     */
    _Detail?: Array<DetailType>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_Registry` |
     * | Type | `com.sap.gateway.srvd_a2x.zsr_registry.v0001.RegistryType` |
     * | Nullable | `false` |
     */
    _Registry?: RegistryType;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_Status` |
     * | Type | `com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZI_VRS_STAT_VHType` |
     */
    _Status?: ZI_VRS_STAT_VHType | null;
}

export type VersionTypeId = string | { VersionId: string };

export interface EditableVersionType extends Pick<VersionType, "GroupId" | "VersionNo" | "GroupHash" | "Status" | "StatusText" | "CreatedBy" | "TriggerType" | "TriggerText" | "LatestVersion">, Partial<Pick<VersionType, "CreatedAt" | "LastChangeAt">> {
    SAP__Messages: Array<EditableSAP__Message>;
}

export interface VersionType_compareVersionParams {
    base_vrs_id?: string | null;
    compare_vrs_id?: string | null;
}

export interface ZI_GRP_TYPE_VHType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TypeId` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    TypeId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Description` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Description: string;
}

export type ZI_GRP_TYPE_VHTypeId = string | { TypeId: string };

export interface EditableZI_GRP_TYPE_VHType extends Pick<ZI_GRP_TYPE_VHType, "Description"> {
}

export interface DetailType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `DetailId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    DetailId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `VersionId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    VersionId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ServiceDefId` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    ServiceDefId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    GroupId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ServiceHash` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    ServiceHash: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `LastChangeAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    LastChangeAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SAP__Messages` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.SAP__Message)` |
     * | Nullable | `false` |
     */
    SAP__Messages: Array<SAP__Message>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_Registry` |
     * | Type | `com.sap.gateway.srvd_a2x.zsr_registry.v0001.RegistryType` |
     */
    _Registry?: RegistryType | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_Version` |
     * | Type | `com.sap.gateway.srvd_a2x.zsr_registry.v0001.VersionType` |
     * | Nullable | `false` |
     */
    _Version?: VersionType;
}

export type DetailTypeId = string | { DetailId: string };

export interface EditableDetailType extends Pick<DetailType, "VersionId" | "ServiceDefId" | "GroupId" | "ServiceHash">, Partial<Pick<DetailType, "LastChangeAt">> {
    SAP__Messages: Array<EditableSAP__Message>;
}

export interface DetailType_getNodeTreeParams {
    DetailId?: string | null;
}

export interface DetailType_compareNodeTreeParams {
    base_detail_id?: string | null;
    compare_detail_id?: string | null;
}

export interface DetailType_getParseMetadataParams {
    DetailId?: string | null;
}

export interface RegistryType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    GroupId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupName` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    GroupName: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupType` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    GroupType: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupTypeText` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    GroupTypeText: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `VersionNo` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    VersionNo: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Status` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Status: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `StatusText` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    StatusText: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `RegisteredBy` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    RegisteredBy: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `RegisteredAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    RegisteredAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `LastChangeAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    LastChangeAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TotalLastChangeAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    TotalLastChangeAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Description` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Description: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SAP__Messages` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.SAP__Message)` |
     * | Nullable | `false` |
     */
    SAP__Messages: Array<SAP__Message>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_Detail` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.DetailType)` |
     */
    _Detail?: Array<DetailType>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_GroupType` |
     * | Type | `com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZI_GRP_TYPE_VHType` |
     */
    _GroupType?: ZI_GRP_TYPE_VHType | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_Status` |
     * | Type | `com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZI_GRP_STAT_VHType` |
     */
    _Status?: ZI_GRP_STAT_VHType | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `_Version` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.VersionType)` |
     */
    _Version?: Array<VersionType>;
}

export type RegistryTypeId = string | { GroupId: string };

export interface EditableRegistryType extends Pick<RegistryType, "GroupName" | "GroupType" | "GroupTypeText" | "VersionNo" | "Status" | "StatusText" | "RegisteredBy" | "Description">, Partial<Pick<RegistryType, "RegisteredAt" | "LastChangeAt" | "TotalLastChangeAt">> {
    SAP__Messages: Array<EditableSAP__Message>;
}

export interface ZI_TRGR_TYPE_VHType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TypeId` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    TypeId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Description` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Description: string;
}

export type ZI_TRGR_TYPE_VHTypeId = string | { TypeId: string };

export interface EditableZI_TRGR_TYPE_VHType extends Pick<ZI_TRGR_TYPE_VHType, "Description"> {
}

export interface LogType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `LogId` |
     * | Type | `Edm.Guid` |
     * | Nullable | `false` |
     */
    LogId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ActionType` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    ActionType: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ActionText` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    ActionText: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Actor` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Actor: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ActionAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    ActionAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `IpAddress` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    IpAddress: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Remarks` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Remarks: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `LogResult` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    LogResult: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ObjectId` |
     * | Type | `Edm.Guid` |
     */
    ObjectId: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `objectIdType` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    objectIdType: string;
}

export type LogTypeId = string | { LogId: string };

export interface EditableLogType extends Pick<LogType, "ActionType" | "ActionText" | "Actor" | "IpAddress" | "Remarks" | "LogResult" | "objectIdType">, Partial<Pick<LogType, "ActionAt" | "ObjectId">> {
}

export interface ZI_GRP_STAT_VHType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `StatusId` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    StatusId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Description` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Description: string;
}

export type ZI_GRP_STAT_VHTypeId = string | { StatusId: string };

export interface EditableZI_GRP_STAT_VHType extends Pick<ZI_GRP_STAT_VHType, "Description"> {
}

export interface ZI_VRS_STAT_VHType {
    /**
     * **Key Property**: This is a key property used to identify the entity.<br/>**Managed**: This property is managed on the server side and cannot be edited.
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `StatusId` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    StatusId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Description` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Description: string;
}

export type ZI_VRS_STAT_VHTypeId = string | { StatusId: string };

export interface EditableZI_VRS_STAT_VHType extends Pick<ZI_VRS_STAT_VHType, "Description"> {
}

export interface ZDATTRIBUTEDIFF {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SEMANTIC_ID` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    SEMANTIC_ID: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NAME` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    NAME: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `STATUS` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    STATUS: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `OLD_VALUE` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    OLD_VALUE: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NEW_VALUE` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    NEW_VALUE: string;
}

export interface EditableZDATTRIBUTEDIFF extends Pick<ZDATTRIBUTEDIFF, "SEMANTIC_ID" | "NAME" | "STATUS" | "OLD_VALUE" | "NEW_VALUE"> {
}

export interface ZI_PERMISSION {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Permission` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Permission: string;
}

export interface EditableZI_PERMISSION extends Pick<ZI_PERMISSION, "Permission"> {
}

export interface ZDATTRIBUTE {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NAME` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    NAME: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `VALUE` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    VALUE: string;
}

export interface EditableZDATTRIBUTE extends Pick<ZDATTRIBUTE, "NAME" | "VALUE"> {
}

export interface ZI_VERSION_RESULT {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `CreatedAt` |
     * | Type | `Edm.DateTimeOffset` |
     */
    CreatedAt: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `CreatedBy` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    CreatedBy: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupHash` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    GroupHash: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupId` |
     * | Type | `Edm.Guid` |
     */
    GroupId: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `LatestVersion` |
     * | Type | `Edm.Boolean` |
     * | Nullable | `false` |
     */
    LatestVersion: boolean;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `Status` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    Status: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `TriggerType` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    TriggerType: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `VersionId` |
     * | Type | `Edm.Guid` |
     */
    VersionId: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `VersionNo` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    VersionNo: string;
}

export interface EditableZI_VERSION_RESULT extends Pick<ZI_VERSION_RESULT, "CreatedBy" | "GroupHash" | "LatestVersion" | "Status" | "TriggerType" | "VersionNo">, Partial<Pick<ZI_VERSION_RESULT, "CreatedAt" | "GroupId" | "VersionId">> {
}

export interface ZDNODEDIFFRESULT {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NODEDIFF` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZDNODEDIFF)` |
     * | Nullable | `false` |
     */
    NODEDIFF: Array<ZDNODEDIFF>;
}

export interface EditableZDNODEDIFFRESULT {
    NODEDIFF: Array<EditableZDNODEDIFF>;
}

export interface ZI_DETAIL_RESULT {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `GroupId` |
     * | Type | `Edm.Guid` |
     */
    GroupId: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `MetadataXml` |
     * | Type | `Edm.Binary` |
     * | Nullable | `false` |
     */
    MetadataXml: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ServiceDefId` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    ServiceDefId: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ServiceHash` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    ServiceHash: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `VersionId` |
     * | Type | `Edm.Guid` |
     */
    VersionId: string | null;
}

export interface EditableZI_DETAIL_RESULT extends Pick<ZI_DETAIL_RESULT, "MetadataXml" | "ServiceDefId" | "ServiceHash">, Partial<Pick<ZI_DETAIL_RESULT, "GroupId" | "VersionId">> {
}

export interface ZDNODETREE {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NODE_ID` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    NODE_ID: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SEMANTIC_ID` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    SEMANTIC_ID: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `PARENT_ID` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    PARENT_ID: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NODE_PATH` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    NODE_PATH: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NODE_TYPE` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    NODE_TYPE: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NODE_NAME` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    NODE_NAME: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NODE_ALIAS` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    NODE_ALIAS: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `OFFSET_START` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    OFFSET_START: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `OFFSET_END` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    OFFSET_END: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SEQ` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    SEQ: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `DEPTH` |
     * | Type | `Edm.Int32` |
     * | Nullable | `false` |
     */
    DEPTH: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ATTRIBUTES` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZDATTRIBUTE)` |
     * | Nullable | `false` |
     */
    ATTRIBUTES: Array<ZDATTRIBUTE>;
}

export interface EditableZDNODETREE extends Pick<ZDNODETREE, "NODE_ID" | "SEMANTIC_ID" | "PARENT_ID" | "NODE_PATH" | "NODE_TYPE" | "NODE_NAME" | "NODE_ALIAS" | "OFFSET_START" | "OFFSET_END" | "SEQ" | "DEPTH"> {
    ATTRIBUTES: Array<EditableZDATTRIBUTE>;
}

export interface ZI_METADATA_RESULT {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `DetailId` |
     * | Type | `Edm.Guid` |
     */
    DetailId: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `MetadataXml` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    MetadataXml: string;
}

export interface EditableZI_METADATA_RESULT extends Pick<ZI_METADATA_RESULT, "MetadataXml">, Partial<Pick<ZI_METADATA_RESULT, "DetailId">> {
}

export interface ZDVRSDIFF {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SERVICEDEFID` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    SERVICEDEFID: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `BASEDETAILID` |
     * | Type | `Edm.Guid` |
     */
    BASEDETAILID: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `COMPAREDETAILID` |
     * | Type | `Edm.Guid` |
     */
    COMPAREDETAILID: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `CHANGETYPE` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    CHANGETYPE: string;
}

export interface EditableZDVRSDIFF extends Pick<ZDVRSDIFF, "SERVICEDEFID" | "CHANGETYPE">, Partial<Pick<ZDVRSDIFF, "BASEDETAILID" | "COMPAREDETAILID">> {
}

export interface ZDNODEDIFF {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `SEMANTIC_ID` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    SEMANTIC_ID: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `STATUS` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    STATUS: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `ATTRIBUTEDIFF` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZDATTRIBUTEDIFF)` |
     * | Nullable | `false` |
     */
    ATTRIBUTEDIFF: Array<ZDATTRIBUTEDIFF>;
}

export interface EditableZDNODEDIFF extends Pick<ZDNODEDIFF, "SEMANTIC_ID" | "STATUS"> {
    ATTRIBUTEDIFF: Array<EditableZDATTRIBUTEDIFF>;
}

export interface ZDVRSDIFFRESULT {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `BASEVERSIONID` |
     * | Type | `Edm.Guid` |
     */
    BASEVERSIONID: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `COMPAREVERSIONID` |
     * | Type | `Edm.Guid` |
     */
    COMPAREVERSIONID: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `CHANGE` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZDVRSDIFF)` |
     * | Nullable | `false` |
     */
    CHANGE: Array<ZDVRSDIFF>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `DIFFER` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZDVRSDIFF)` |
     * | Nullable | `false` |
     */
    DIFFER: Array<ZDVRSDIFF>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `UNCHANGE` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZDVRSDIFF)` |
     * | Nullable | `false` |
     */
    UNCHANGE: Array<ZDVRSDIFF>;
}

export interface EditableZDVRSDIFFRESULT extends Partial<Pick<ZDVRSDIFFRESULT, "BASEVERSIONID" | "COMPAREVERSIONID">> {
    CHANGE: Array<EditableZDVRSDIFF>;
    DIFFER: Array<EditableZDVRSDIFF>;
    UNCHANGE: Array<EditableZDVRSDIFF>;
}

export interface ZNODETREERESULT {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `NODETREE` |
     * | Type | `Collection(com.sap.gateway.srvd_a2x.zsr_registry.v0001.ZDNODETREE)` |
     * | Nullable | `false` |
     */
    NODETREE: Array<ZDNODETREE>;
}

export interface EditableZNODETREERESULT {
    NODETREE: Array<EditableZDNODETREE>;
}

export interface SAP__Message {
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `code` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    code: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `message` |
     * | Type | `Edm.String` |
     * | Nullable | `false` |
     */
    message: string;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `target` |
     * | Type | `Edm.String` |
     */
    target: string | null;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `additionalTargets` |
     * | Type | `Collection(Edm.String)` |
     * | Nullable | `false` |
     */
    additionalTargets: Array<string>;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `transition` |
     * | Type | `Edm.Boolean` |
     * | Nullable | `false` |
     */
    transition: boolean;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `numericSeverity` |
     * | Type | `Edm.Byte` |
     * | Nullable | `false` |
     */
    numericSeverity: number;
    /**
     *
     * OData Attributes:
     * |Attribute Name | Attribute Value |
     * | --- | ---|
     * | Name | `longtextUrl` |
     * | Type | `Edm.String` |
     */
    longtextUrl: string | null;
}

export interface EditableSAP__Message extends Pick<SAP__Message, "code" | "message" | "additionalTargets" | "transition" | "numericSeverity">, Partial<Pick<SAP__Message, "target" | "longtextUrl">> {
}
