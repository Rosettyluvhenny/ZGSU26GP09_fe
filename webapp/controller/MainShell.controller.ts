import JSONModel from "sap/ui/model/json/JSONModel";

import BaseController from "./BaseController";

/**
 * @namespace com.zgp9.fe.controller
 */
export default class MainShell extends BaseController {
	private pendingRoute: string | null = null;
	private initialRedirectDone = false;

	public onInit(): void {
		this.getView().addEventDelegate({
			onAfterRendering: () => this.handleAfterRendering(),
		});
	}

	public onNavigateRegistries(): void {
		this.getUiModel().setProperty("/currentSection", "registries");
		this.navigateWhenReady("registryList");
	}

	public onNavigateJobs(): void {
		this.getUiModel().setProperty("/currentSection", "jobs");
		this.navigateWhenReady("jobList");
	}

	public async onLogout(): Promise<void> {
		const auth = this.getOwnerComponent().getAuthenticationService();
		await auth.logout();
		(this.getSessionModel() as JSONModel).setData({
			authenticated: false,
			userName: "",
			csrfToken: "",
			loginAt: null,
		});
		this.navTo("login", {}, true);
	}

	private navigateWhenReady(route: "registryList" | "jobList"): void {
		this.pendingRoute = route;
		this.flushPendingNavigation();
	}

	private handleAfterRendering(): void {
		if (!this.initialRedirectDone && this.getCurrentHash() === "home") {
			this.getUiModel().setProperty("/currentSection", "registries");
			this.pendingRoute = "registryList";
			this.initialRedirectDone = true;
		}

		this.flushPendingNavigation();
	}

	private flushPendingNavigation(): void {
		if (!this.pendingRoute) {
			return;
		}

		if (!this.byId("shellFcl")) {
			console.log("shellFcl not found yet, waiting...");
			return;
		}

		const route = this.pendingRoute;
		this.pendingRoute = null;
		const fcl = this.byId("shellFcl");
		console.log("id:", fcl?.getId());
		console.log("class:", fcl?.getMetadata().getName());
		console.log("is FCL:", fcl?.isA("sap.f.FlexibleColumnLayout"));
		this.navTo(route, {}, true);
	}

	private getCurrentHash(): string {
		return window.location.hash.replace(/^#/, "");
	}
}
