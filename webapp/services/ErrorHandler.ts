import MessageBox from "sap/m/MessageBox";
import ServiceError from "./ServiceError";
import ODataClient from "./ODataClient";
import type Router from "sap/ui/core/routing/Router";

export default class ErrorHandler {
	private handlingAuthError = false;

	public constructor(
		private readonly router: Router
	) { }

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
				this.router.navTo("login", undefined, undefined, true);
				const message = error.status === 403 ? "Your session expired. Please sign in again." : "Your session expired. Please sign in again.";
				MessageBox.error(message, {
					onClose: () => {
						this.handlingAuthError = false;
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
