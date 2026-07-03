import MessageBox from "sap/m/MessageBox";
import ServiceError from "./ServiceError";
import AuthenticationService from "./AuthenticationService";
import type Router from "sap/ui/core/routing/Router";

export default class ErrorHandler {
	public constructor(
		private readonly router: Router,
		private readonly authenticationService: AuthenticationService
	) {}

	public async handle(error: unknown): Promise<void> {
		if (error instanceof ServiceError) {
			if (error.status === 401) {
				await this.safeLogout();
				this.router.navTo("login", undefined, undefined, true);
				MessageBox.error(error.message || "Your session expired. Please sign in again.");
				return;
			}

			if (error.status === 403) {
				try {
					await this.authenticationService.fetchCsrfToken();
				} catch {
					await this.safeLogout();
					this.router.navTo("login", undefined, undefined, true);
				}
				MessageBox.warning(error.message || "A CSRF token issue occurred. The token was refreshed.");
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

	private async safeLogout(): Promise<void> {
		try {
			await this.authenticationService?.logout?.();
		} catch {
			// Ignore logout failures so the original service error stays visible.
		}
	}
}
