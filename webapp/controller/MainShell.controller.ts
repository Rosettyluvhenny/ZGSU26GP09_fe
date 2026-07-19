import Theming from "sap/ui/core/Theming";
import type Control from "sap/ui/core/Control";

import BaseController from "./BaseController";
import ODataClient from "../services/ODataClient";
import { readSideNavPreference, writeSideNavPreference, writeThemePreference } from "../services/SessionStorage";

const LIGHT_THEME = "sap_horizon";
const DARK_THEME = "sap_horizon_dark";

/**
 * @namespace com.zgp9.fe.controller
 */
export default class MainShell extends BaseController {
	private pendingRoute: string | null = null;

	public onInit(): void {
		this.getRouter().attachRouteMatched((event) => { void this.onGlobalRouteMatched(event); });

		this.getView().addEventDelegate({
			onAfterRendering: () => this.flushPendingNavigation(),
		});

		const sideNavVisible = readSideNavPreference();
		this.getUiModel().setProperty("/sideNavVisible", sideNavVisible);
		this.applySideNavVisibility(sideNavVisible);

		// Load permissions once on page load — drives nav bar and button visibility
		void this.loadGlobalPermissions();
	}

	public onToggleSideNav(): void {
		const visible = !(this.getUiModel().getProperty("/sideNavVisible") as boolean);
		this.getUiModel().setProperty("/sideNavVisible", visible);
		this.applySideNavVisibility(visible);
		writeSideNavPreference(visible);
	}

	private applySideNavVisibility(visible: boolean): void {
		// sideExpanded=false alone leaves an icon-only rail; this class hides the
		// side area completely so the main content takes the full width (see style.css).
		(this.byId("shellPage") as Control | null)?.toggleStyleClass("shellSideNavHidden", !visible);
	}

	private async loadGlobalPermissions(): Promise<void> {
		try {
			const permissions = await this.getOwnerComponent().getRegistryService().getPermissions();
			const ui = this.getUiModel();
			ui.setProperty("/canExecuteScanJob", permissions.includes("ScanJob.Execute"));
			ui.setProperty("/canCreate", permissions.includes("Registry.Create"));
			ui.setProperty("/canUpdate", permissions.includes("Registry.Update"));
		} catch {
			const ui = this.getUiModel();
			ui.setProperty("/canExecuteScanJob", false);
			ui.setProperty("/canCreate", false);
			ui.setProperty("/canUpdate", false);
		}
	}

	private async onGlobalRouteMatched(event: import("sap/ui/core/routing/Router").Router$RouteMatchedEvent): Promise<void> {
		const routeName = event.getParameter("name");

		if (routeName.startsWith("registry") || routeName.startsWith("version") || routeName.startsWith("detailCompare")) {
			this.getUiModel().setProperty("/currentSection", "registries");
		} else if (routeName.startsWith("job")) {
			this.getUiModel().setProperty("/currentSection", "jobs");
		} else if (routeName === "home") {
			this.getUiModel().setProperty("/currentSection", "home");
		} else if (routeName === "logs") {
			this.getUiModel().setProperty("/currentSection", "logs");
		}

		// Guard: redirect away from job routes if user lacks permission
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
		ODataClient.clearSecurityState();
		(this.getSessionModel()).setData({
			userName: "",
			csrfToken: "",
			loginAt: null,
		});
		this.getUiModel().setProperty("/canExecuteScanJob", false);
		window.location.reload();
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
