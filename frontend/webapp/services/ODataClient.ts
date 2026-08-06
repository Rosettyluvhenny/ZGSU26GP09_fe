import type ODataModel from 'sap/ui/model/odata/v4/ODataModel';
import type Context from 'sap/ui/model/odata/v4/Context';
import type Filter from 'sap/ui/model/Filter';
import type Sorter from 'sap/ui/model/Sorter';

import ServiceError from './ServiceError';

// ---------------------------------------------------------------------------
// NOTE: No CSRF token / auth-header handling here.
// Authentication is done via principal propagation (reverse proxy / SSO),
// and CSRF tokens for mutating requests are managed internally by
// sap.ui.model.odata.v4.ODataModel. There is nothing to fetch, cache, or
// refresh manually — every call below is a direct, synchronous-looking
// wrapper around the model's own request queue.
// ---------------------------------------------------------------------------

export interface ReadListOptions {
	sorters?: Sorter[];
	filters?: Filter[];
	parameters?: Record<string, string>;
	skip?: number;
	top?: number;
}

export interface CallActionOptions {
	/** Bind the action to this context (entity-bound or a list binding's header context for collection-bound actions). Omit for unbound actions. */
	context?: Context;
	parameters?: Record<string, unknown>;
}

function toServiceError(error: unknown, context: string): ServiceError {
	const err = error as {
		message?: string;
		status?: number;
		error?: { message?: string; code?: string };
		cause?: { message?: string };
	};

	const message =
		err?.error?.message ||
		err?.cause?.message ||
		err?.message ||
		`${context} failed.`;

	return new ServiceError(err?.status ?? 500, message);
}

/**
 * True when a rejection looks like a CSRF-token failure that survived the
 * model's own internal fetch-and-retry. At this point retrying the exact
 * same request again won't help on its own — the session/token needs to be
 * re-established first (see withCsrfRetry below).
 */
function isCsrfFailure(error: unknown): boolean {
	const err = error as { status?: number; message?: string };
	return err?.status === 403 && /csrf/i.test(err?.message ?? '');
}

/**
 * Wraps a write/action operation so that, if it fails with a CSRF error
 * (the model already retried once internally and still failed), we force a
 * model refresh to re-establish a fresh CSRF token/session and retry the
 * operation exactly once more before giving up.
 */
async function withCsrfRetry<T>(model: ODataModel, operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (!isCsrfFailure(error)) {
			throw error;
		}
		model.refresh();
		return operation();
	}
}

/**
 * Creates a lightweight functional wrapper around an existing ODataModel v4
 * instance. No shared/static state, no CSRF handling — just domain-shaped
 * read/write/action helpers translated to the model's bindList/bindContext API.
 */
export function createODataClient(model: ODataModel) {
	function bindContextAt(path: string): Context {
		return model.bindContext(path).getBoundContext();
	}

	async function readList<T = Record<string, unknown>>(path: string, options: ReadListOptions = {}): Promise<T[]> {
		try {
			const oListBinding = model.bindList(
				path,
				undefined,
				options.sorters,
				options.filters,
				options.parameters
			);

			const aContexts = await oListBinding.requestContexts(options.skip, options.top);
			return aContexts.map((oContext) => oContext.getObject() as T);
		} catch (error) {
			throw toServiceError(error, `readList ${path}`);
		}
	}

	/**
	 * Same as readList, but also requests the server-side total count
	 * (equivalent to $count=true). Use this for paged lists where you need
	 * to know "how many more" beyond the current page.
	 */
	async function readListWithCount<T = Record<string, unknown>>(
		path: string,
		options: ReadListOptions = {}
	): Promise<{ items: T[]; count: number }> {
		try {
			const oListBinding = model.bindList(path, undefined, options.sorters, options.filters, {
				...options.parameters,
				'$count': 'true'
			});

			const aContexts = await oListBinding.requestContexts(options.skip, options.top);
			const items = aContexts.map((oContext) => oContext.getObject() as T);
			const count = oListBinding.getCount() ?? items.length;
			return { items, count };
		} catch (error) {
			throw toServiceError(error, `readListWithCount ${path}`);
		}
	}

	async function readOne<T = Record<string, unknown>>(path: string): Promise<T | null> {
		try {
			const oContext = bindContextAt(path);
			const entity = (await oContext.requestObject()) as T | undefined;
			if (!entity || !Object.keys(entity as Record<string, unknown>).length) {
				return null;
			}
			return entity;
		} catch (error) {
			throw toServiceError(error, `readOne ${path}`);
		}
	}

	async function create<T = Record<string, unknown>>(collectionPath: string, payload: Record<string, unknown>): Promise<T> {
		try {
			return await withCsrfRetry(model, async () => {
				const oListBinding = model.bindList(collectionPath);
				const oContext = oListBinding.create(payload);
				await oContext.created();
				return oContext.getObject() as T;
			});
		} catch (error) {
			throw toServiceError(error, `create ${collectionPath}`);
		}
	}

	async function update<T = Record<string, unknown>>(
		entityPath: string,
		patch: Record<string, unknown>,
		groupId = '$auto'
	): Promise<T> {
		try {
			return await withCsrfRetry(model, async () => {
				const oContext = bindContextAt(entityPath);
				for (const [field, value] of Object.entries(patch)) {
					await oContext.setProperty(field, value);
				}
				await model.submitBatch(groupId);
				return oContext.getObject() as T;
			});
		} catch (error) {
			throw toServiceError(error, `update ${entityPath}`);
		}
	}

	async function updateContext<T = Record<string, unknown>>(
		context: Context,
		patch: Record<string, unknown>,
		groupId = '$auto'
	): Promise<T> {
		try {
			return await withCsrfRetry(model, async () => {
				for (const [field, value] of Object.entries(patch)) {
					await context.setProperty(field, value);
				}
				await model.submitBatch(groupId);
				return context.getObject() as T;
			});
		} catch (error) {
			throw toServiceError(error, 'update context');
		}
	}

	async function remove(entityPath: string): Promise<void> {
		try {
			await withCsrfRetry(model, async () => {
				const oContext = bindContextAt(entityPath);
				await oContext.delete();
			});
		} catch (error) {
			throw toServiceError(error, `remove ${entityPath}`);
		}
	}

	async function removeContext(context: Context): Promise<void> {
		try {
			await withCsrfRetry(model, () => context.delete());
		} catch (error) {
			throw toServiceError(error, 'remove context');
		}
	}

	/**
	 * Calls a bound or unbound action/function.
	 * - Unbound: pass an operation path like "/actionName(...)" with no context.
	 * - Entity-bound: pass "namespace.actionName(...)" plus the entity's Context.
	 * - Collection-bound: pass "namespace.actionName(...)" plus a list binding's
	 *   header context (listBinding.getHeaderContext()).
	 */
	async function callAction<T = Record<string, unknown>>(operationPath: string, options: CallActionOptions = {}): Promise<T> {
		try {
			return await withCsrfRetry(model, async () => {
				const oOperation = model.bindContext(operationPath, options.context);

				if (options.parameters) {
					for (const [name, value] of Object.entries(options.parameters)) {
						oOperation.setParameter(name, value);
					}
				}

				await oOperation.execute();
				return oOperation.getBoundContext()?.getObject() as T;
			});
		} catch (error) {
			throw toServiceError(error, `callAction ${operationPath}`);
		}
	}

	function getHeaderContext(collectionPath: string): Context {
		const oListBinding = model.bindList(collectionPath);
		return oListBinding.getHeaderContext();
	}

	function bindEntity(entityPath: string): Context {
		return bindContextAt(entityPath);
	}

	function refresh(context?: Context): void {
		if (context) {
			context.refresh();
		} else {
			model.refresh();
		}
	}

	return {
		readList,
		readListWithCount,
		readOne,
		create,
		update,
		updateContext,
		remove,
		removeContext,
		callAction,
		getHeaderContext,
		bindEntity,
		refresh
	};
}

export type ODataClient = ReturnType<typeof createODataClient>;