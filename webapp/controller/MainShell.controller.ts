import JSONModel from "sap/ui/model/json/JSONModel";

import BaseController from "./BaseController";

/**
 * @namespace com.zgp9.fe.controller
 */
export default class MainShell extends BaseController {
	private pendingRoute: string | null = null;
	private initialRedirectDone = false;
	private permissionsPromise: Promise<void> | null = null;

	public onInit(): void {
		this.getRouter().attachRouteMatched(this.onGlobalRouteMatched, this);
		
		this.getView().addEventDelegate({
			onAfterRendering: () => this.flushPendingNavigation(),
		});
	}

	private async loadGlobalPermissions(): Promise<void> {
		try {
			const permissions = await this.getOwnerComponent().getRegistryService().getPermissions();
			this.getUiModel().setProperty("/canExecuteScanJob", permissions.includes("ScanJob.Execute"));
		} catch {
			this.getUiModel().setProperty("/canExecuteScanJob", false);
		}
	}

	private async onGlobalRouteMatched(event: any): Promise<void> {
		const routeName = event.getParameter("name") as string;
		
		if (routeName === "login") {
			return;
		}

		const session = this.getSessionModel().getData() as any;
		if (!session?.authenticated) {
			return;
		}

		if (!this.permissionsPromise) {
			this.permissionsPromise = this.loadGlobalPermissions();
		}

		await this.permissionsPromise;

		if (routeName.startsWith("registry") || routeName.startsWith("version") || routeName.startsWith("detailCompare")) {
			this.getUiModel().setProperty("/currentSection", "registries");
		} else if (routeName.startsWith("job")) {
			const canExecute = this.getUiModel().getProperty("/canExecuteScanJob");
			if (canExecute) {
				this.getUiModel().setProperty("/currentSection", "jobs");
			} else {
				this.navTo("home", {}, true);
			}
		} else if (routeName === "home") {
			this.getUiModel().setProperty("/currentSection", "home");
		}
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
		this.permissionsPromise = null;
		this.getUiModel().setProperty("/canExecuteScanJob", false);
		this.navTo("login", {}, true);
	}

	private navigateWhenReady(route: "registryList" | "jobList"): void {
		this.pendingRoute = route;
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
