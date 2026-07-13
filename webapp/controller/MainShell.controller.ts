import Theming from "sap/ui/core/Theming";

import BaseController from "./BaseController";
import { writeThemePreference } from "../services/SessionStorage";

const LIGHT_THEME = "sap_horizon";
const DARK_THEME = "sap_horizon_dark";

/**
 * @namespace com.zgp9.fe.controller
 */
export default class MainShell extends BaseController {
	private pendingRoute: string | null = null;

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

	private async onGlobalRouteMatched(event: import("sap/ui/core/routing/Router").Router$RouteMatchedEvent): Promise<void> {
		const routeName = event.getParameter("name") as string;

		if (routeName === "login") {
			return;
		}

		const session = this.getSessionModel().getData() as { authenticated?: boolean };
		if (!session?.authenticated) {
			return;
		}

		if (routeName.startsWith("registry") || routeName.startsWith("version") || routeName.startsWith("detailCompare")) {
			this.getUiModel().setProperty("/currentSection", "registries");
		} else if (routeName.startsWith("job")) {
			this.getUiModel().setProperty("/currentSection", "jobs");
		} else if (routeName === "home") {
			this.getUiModel().setProperty("/currentSection", "home");
		} else if (routeName === "logs") {
			this.getUiModel().setProperty("/currentSection", "logs");
		}

		await this.loadGlobalPermissions();

		if (routeName.startsWith("job") && !this.getUiModel().getProperty("/canExecuteScanJob")) {
			this.getUiModel().setProperty("/currentSection", "home");
			this.navTo("home", {}, true);
		}
	}

	public onNavigateHome(): void {
		this.getUiModel().setProperty("/currentSection", "home");
		this.navigateWhenReady("home");
	}

	public onNavigateRegistries(): void {
		this.getUiModel().setProperty("/currentSection", "registries");
		this.navigateWhenReady("registryList");
	}

	public onNavigateJobs(): void {
		this.getUiModel().setProperty("/currentSection", "jobs");
		this.navigateWhenReady("jobList");
	}

	public onNavigateLogs(): void {
		this.getUiModel().setProperty("/currentSection", "logs");
		this.navigateWhenReady("logs");
	}

	public onToggleTheme(): void {
		const nextIsDark = !this.getUiModel().getProperty("/isDarkTheme");
		const nextTheme = nextIsDark ? DARK_THEME : LIGHT_THEME;
		Theming.setTheme(nextTheme);
		writeThemePreference(nextTheme);
		this.getUiModel().setProperty("/isDarkTheme", nextIsDark);
	}

	public async onLogout(): Promise<void> {
		const auth = this.getOwnerComponent().getAuthenticationService();
		await auth.logout();
		(this.getSessionModel()).setData({
			authenticated: false,
			userName: "",
			csrfToken: "",
			loginAt: null,
		});
		this.getUiModel().setProperty("/canExecuteScanJob", false);
		this.navTo("login", {}, true);
	}

	private navigateWhenReady(route: "home" | "registryList" | "jobList" | "logs"): void {
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
