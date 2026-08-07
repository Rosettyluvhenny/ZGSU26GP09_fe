import Theming from "sap/ui/core/Theming";
import type Control from "sap/ui/core/Control";

import BaseController from "./BaseController";
import { readSideNavPreference, writeSideNavPreference, writeThemePreference } from "../services/SessionStorage";

const LIGHT_THEME = "sap_horizon";
const DARK_THEME = "sap_horizon_dark";

/**
 * @namespace com.zgp09.fe.controller
 */
export default class MainShell extends BaseController {
	private pendingRoute: string | null = null;

	public onInit(): void {
		this.getRouter().attachRouteMatched((event) => { this.onGlobalRouteMatched(event); });

		this.getView().addEventDelegate({
			onAfterRendering: () => this.flushPendingNavigation(),
		});

		// On phone-width screens the side navigation renders as a full-screen overlay,
		// so default it collapsed and let the user open it via the menu button — the
		// stored preference only drives the desktop/tablet experience.
		const isPhoneWidth = window.matchMedia("(max-width: 599px)").matches;
		const sideNavVisible = isPhoneWidth ? false : readSideNavPreference();
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
		} finally {
			this.getUiModel().setProperty("/permissionsLoaded", true);
		}
	}

	private onGlobalRouteMatched(event: import("sap/ui/core/routing/Router").Router$RouteMatchedEvent): void {
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

	public onLogout(): void {
		(this.getSessionModel()).setData({
			userName: "",
			csrfToken: "",
			loginAt: null,
		});
		this.getUiModel().setProperty("/canExecuteScanJob", false);
		this.redirectToLogout();
	}

	/**
	 * Full-page navigation to the approuter's central logout endpoint. This is what
	 * actually ends the session on BTP: the approuter clears its session cookie and
	 * the XSUAA session, then redirects to logoutPage "/". A plain reload could not do
	 * this — the session cookie survived it, so the approuter re-served the app and the
	 * user appeared stuck logged in. Locally the sap-proxy mirrors /logout as a redirect
	 * to "/". Isolated for unit tests so the QUnit page is not navigated under the runner.
	 */
	protected redirectToLogout(): void {
		window.location.assign("/logout");
	}

	private navigateWhenReady(route: "home" | "registryList" | "jobList" | "logs"): void {
		// On phone the nav is a full-screen overlay; close it so it doesn't cover the
		// page the user just navigated to.
		if (window.matchMedia("(max-width: 599px)").matches && this.getUiModel().getProperty("/sideNavVisible")) {
			this.getUiModel().setProperty("/sideNavVisible", false);
			this.applySideNavVisibility(false);
		}
		this.pendingRoute = route;
		this.flushPendingNavigation();
	}

	private flushPendingNavigation(): void {
		if (!this.pendingRoute) {
			return;
		}

		if (!this.byId("shellFcl")) {
			return;
		}

		const route = this.pendingRoute;
		this.pendingRoute = null;
		this.navTo(route, {}, true);
	}

	private getCurrentHash(): string {
		return window.location.hash.replace(/^#/, "");
	}
}
