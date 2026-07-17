import type { Route$PatternMatchedEvent } from 'sap/ui/core/routing/Route';
import type { ListBase$ItemPressEvent } from 'sap/m/ListBase';
import type UI5Event from 'sap/ui/base/Event';
import JSONModel from 'sap/ui/model/json/JSONModel';
import BusyIndicator from 'sap/ui/core/BusyIndicator';
import History from 'sap/ui/core/routing/History';

import BaseController, { type AiChatContext } from './BaseController';
import type { RegistryDetail } from '../model/types';
import {
	parseEdmx,
	type EdmComplexType,
	type EdmEntitySet,
	type EdmEntityType,
	type EdmEnumType,
	type EdmModel,
	type EdmOperation
} from '../services/EdmxModel';

type EdmElement = EdmEntityType | EdmEntitySet | EdmComplexType | EdmEnumType | EdmOperation;
type EdmKind = 'entityType' | 'entitySet' | 'complexType' | 'enumType' | 'operation';

/**
 * @namespace com.zgp9.fe.controller
 */
export default class ModelExplorer extends BaseController {
	private registryId: string | null = null;
	private versionId: string | null = null;
	private detailId: string | null = null;
	private edm: EdmModel | null = null;
	private rawXml = '';

	public onInit(): void {
		this.setModel(
			new JSONModel({
				busy: false,
				serviceName: '',
				version: '',
				parseError: '',
				details: [] as RegistryDetail[],
				selectedDetailId: '',
				search: '',
				counts: { entityTypes: 0, entitySets: 0, complexTypes: 0, enumTypes: 0, operations: 0 },
				entityTypes: [] as EdmEntityType[],
				entitySets: [] as EdmEntitySet[],
				complexTypes: [] as EdmComplexType[],
				enumTypes: [] as EdmEnumType[],
				operations: [] as EdmOperation[],
				selectedKind: '' as EdmKind | '',
				selected: null as EdmElement | null,
				selectedKeysText: ''
			}),
			'model'
		);

		this.getRouter()
			.getRoute('modelExplorer')
			.attachPatternMatched((event) => {
				void this.onRouteMatched(event);
			});
	}

	public async onRouteMatched(event: UI5Event): Promise<void> {
		const args = (event as Route$PatternMatchedEvent).getParameter('arguments') as {
			registryId?: string;
			versionId?: string;
			'?query'?: { detailId?: string };
		};
		this.registryId = args.registryId ?? null;
		this.versionId = args.versionId ?? null;
		this.detailId = args['?query']?.detailId ?? null;
		if (!this.registryId || !this.versionId) {
			return;
		}
		await this.load();
	}

	public async onRefresh(): Promise<void> {
		await this.load();
	}

	protected getAiChatContext(): AiChatContext | null {
		if (!this.rawXml) {
			return null;
		}
		const model = this.getModel('model') as JSONModel;
		return {
			label: (model.getProperty('/serviceName') as string) || 'Service metadata model',
			xml: this.rawXml,
			suggestions: ['Summarize this model', 'List entity types and their keys', 'Any design issues?'],
			storageKey: this.detailId ? `model.${this.detailId}` : undefined
		};
	}

	public onNavBack(): void {
		const previousHash = History.getInstance().getPreviousHash();
		if (previousHash !== undefined && previousHash !== '') {
			window.history.go(-1);
		} else if (this.registryId && this.versionId) {
			this.navToXml();
		} else {
			this.getRouter().navTo('home', {}, undefined, true);
		}
	}

	/** Jump to the raw-XML / node-tree view for the same service definition. */
	public navToXml(): void {
		if (!this.registryId || !this.versionId) {
			return;
		}
		this.getRouter().navTo('versionDetail', {
			registryId: this.registryId,
			versionId: this.versionId,
			query: this.detailId ? { detailId: this.detailId } : {}
		});
	}

	public async onDetailChange(event: UI5Event): Promise<void> {
		const source = event.getSource() as unknown as { getSelectedKey: () => string };
		const nextId = source.getSelectedKey();
		if (!nextId || nextId === this.detailId) {
			return;
		}
		this.detailId = nextId;
		await this.load();
	}

	public onSearch(event: UI5Event): void {
		const source = event.getSource() as unknown as { getValue: () => string };
		this.applySearch(source.getValue() || '');
	}

	public onSelectEntityType(event: UI5Event): void {
		this.selectFromEvent(event, 'entityType');
	}

	public onSelectEntitySet(event: UI5Event): void {
		this.selectFromEvent(event, 'entitySet');
	}

	public onSelectComplexType(event: UI5Event): void {
		this.selectFromEvent(event, 'complexType');
	}

	public onSelectEnumType(event: UI5Event): void {
		this.selectFromEvent(event, 'enumType');
	}

	public onSelectOperation(event: UI5Event): void {
		this.selectFromEvent(event, 'operation');
	}

	private selectFromEvent(event: UI5Event, kind: EdmKind): void {
		const item = (event as ListBase$ItemPressEvent).getParameter('listItem') as {
			getBindingContext: (name?: string) => { getObject: () => EdmElement } | null;
		} | null;
		const element = item?.getBindingContext('model')?.getObject();
		if (element) {
			this.selectElement(kind, element);
		}
	}

	private selectElement(kind: EdmKind, element: EdmElement): void {
		const model = this.getModel('model') as JSONModel;
		model.setProperty('/selectedKind', kind);
		model.setProperty('/selected', element);
		const keys = (element as EdmEntityType).keys;
		model.setProperty('/selectedKeysText', Array.isArray(keys) && keys.length > 0 ? keys.join(', ') : '');
	}

	private async load(): Promise<void> {
		if (!this.versionId) {
			return;
		}
		const model = this.getModel('model') as JSONModel;
		model.setProperty('/busy', true);
		model.setProperty('/parseError', '');
		BusyIndicator.show(0);
		try {
			const details = await this.getOwnerComponent().getDetailService().getDetails(this.versionId);
			model.setProperty('/details', details);

			let target: RegistryDetail | undefined = this.detailId
				? details.find((detail) => detail.id === this.detailId)
				: undefined;
			target = target ?? details[0];

			if (!target) {
				this.edm = null;
				this.rawXml = '';
				this.resetModelData();
				model.setProperty('/parseError', 'This version has no service definition to explore.');
				return;
			}

			this.detailId = target.id;
			model.setProperty('/selectedDetailId', target.id);
			model.setProperty('/serviceName', target.serviceDefinition || target.id);

			const parsed = await this.getOwnerComponent().getDetailService().getParsedDetail(target.id);
			this.rawXml = (parsed.metadataXml || target.xml || '').replace(/<\?xml[^>]*\?>\s*/gi, '');
			this.edm = parseEdmx(this.rawXml);
			this.populateModelData(this.edm);
		} catch (error) {
			await this.handleServiceError(error);
		} finally {
			model.setProperty('/busy', false);
			BusyIndicator.hide();
		}
	}

	private resetModelData(): void {
		const model = this.getModel('model') as JSONModel;
		model.setProperty('/entityTypes', []);
		model.setProperty('/entitySets', []);
		model.setProperty('/complexTypes', []);
		model.setProperty('/enumTypes', []);
		model.setProperty('/operations', []);
		model.setProperty('/counts', { entityTypes: 0, entitySets: 0, complexTypes: 0, enumTypes: 0, operations: 0 });
		model.setProperty('/selectedKind', '');
		model.setProperty('/selected', null);
		model.setProperty('/selectedKeysText', '');
		model.setProperty('/version', '');
	}

	private populateModelData(edm: EdmModel): void {
		const model = this.getModel('model') as JSONModel;
		model.setProperty('/version', edm.version.toUpperCase());
		model.setProperty('/parseError', edm.error);
		model.setProperty('/search', '');
		this.applySearch('');

		// Auto-select the first available element so the detail pane isn't empty.
		if (edm.entityTypes.length > 0) {
			this.selectElement('entityType', edm.entityTypes[0]);
		} else if (edm.entitySets.length > 0) {
			this.selectElement('entitySet', edm.entitySets[0]);
		} else if (edm.complexTypes.length > 0) {
			this.selectElement('complexType', edm.complexTypes[0]);
		} else if (edm.enumTypes.length > 0) {
			this.selectElement('enumType', edm.enumTypes[0]);
		} else if (edm.operations.length > 0) {
			this.selectElement('operation', edm.operations[0]);
		} else {
			model.setProperty('/selectedKind', '');
			model.setProperty('/selected', null);
		}
	}

	private applySearch(query: string): void {
		const model = this.getModel('model') as JSONModel;
		const edm = this.edm;
		if (!edm) {
			return;
		}
		const q = query.trim().toLowerCase();
		const filter = <T extends { name: string }>(items: T[]): T[] =>
			q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;

		const entityTypes = filter(edm.entityTypes);
		const entitySets = filter(edm.entitySets);
		const complexTypes = filter(edm.complexTypes);
		const enumTypes = filter(edm.enumTypes);
		const operations = filter(edm.operations);

		model.setProperty('/entityTypes', entityTypes);
		model.setProperty('/entitySets', entitySets);
		model.setProperty('/complexTypes', complexTypes);
		model.setProperty('/enumTypes', enumTypes);
		model.setProperty('/operations', operations);
		model.setProperty('/counts', {
			entityTypes: entityTypes.length,
			entitySets: entitySets.length,
			complexTypes: complexTypes.length,
			enumTypes: enumTypes.length,
			operations: operations.length
		});
	}
}
