// Action is a named export of the module, not a member of the default export, in the
// 1.108 typings — MessageBox.Action does not compile even though it exists at runtime.
import MessageBox, { Action as MessageBoxAction } from "sap/m/MessageBox";
import ServiceError from "./ServiceError";
import ODataClient from "./ODataClient";

const SESSION_EXPIRED_MESSAGE = "Your session expired. Reload the page to sign in again.";
const RELOAD_ACTION = "Reload";

export default class ErrorHandler {
	private handlingAuthError = false;

	/** Isolated so unit tests can assert on it without navigating the runner page. */
	protected reload(): void {
		window.location.reload();
	}

	public async handle(error: unknown): Promise<void> {
		if (error instanceof ServiceError) {
			if (error.status === 401 || error.status === 403) {
				if (this.handlingAuthError) {
					return;
				}
				this.handlingAuthError = true;

				if (error.status === 403) {
					try {
						await ODataClient.refreshCsrfToken();
						this.handlingAuthError = false;
						return; // Recovered from 403 — retry on next request
					} catch {
						// Fall through to navigate to login
					}
				}

				ODataClient.clearSecurityState();
				// Deliberately not a navTo: there is no "login" route in manifest.json and
				// never was, so the previous navTo("login") only logged "Route with name
				// login does not exist" and left the user stranded behind this dialog with
				// no way back in. Re-authentication is owned by the host (the ABAP server's
				// own auth challenge, or the launchpad shell), and a reload is what triggers
				// it — so offer that instead. See FLP_MIGRATION.md deferred finding G.
				MessageBox.error(SESSION_EXPIRED_MESSAGE, {
					actions: [RELOAD_ACTION, MessageBoxAction.CLOSE],
					emphasizedAction: RELOAD_ACTION,
					onClose: (action: string) => {
						this.handlingAuthError = false;
						if (action === RELOAD_ACTION) {
							this.reload();
						}
					}
				});
				return;
			}

			if (error.status === 500) {
				MessageBox.error(error.message || "An internal server error occurred.");
				return;
			}

			if (error.details.length > 0) {
				MessageBox.error([error.message, ...error.details].join("\n"));
				return;
			}

			MessageBox.error(error.message || "The operation could not be completed.");
			return;
		}

		MessageBox.error("An unexpected error occurred.");
	}

}
