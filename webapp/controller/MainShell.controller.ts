import Core from "sap/ui/core/Core";
import type Control from "sap/ui/core/Control";
import type { Router$RouteMatchedEvent } from "sap/ui/core/routing/Router";

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
		this.getRouter().attachRouteMatched((event: Router$RouteMatchedEvent) => { this.onGlobalRouteMatched(event); });

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

	private onGlobalRouteMatched(event: Router$RouteMatchedEvent): void {
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
		// ui5lint-disable-next-line no-deprecated-api -- sap/ui/core/Theming does not exist on the launchpad's UI5 1.108.33
		Core.applyTheme(nextTheme);
		writeThemePreference(nextTheme);
		this.getUiModel().setProperty("/isDarkTheme", nextIsDark);
	}

	public onLogout(): void {
		ODataClient.clearSecurityState();
		(this.getSessionModel()).setData({
			userName: "",
			csrfToken: "",
			loginAt: null,
		});
		this.getUiModel().setProperty("/canExecuteScanJob", false);
		this.redirectToLogout();
	}

	/**
	 * Ends the session the way the standalone host expects.
	 *
	 * There is deliberately no launchpad branch here. Embedded, the FLP owns the session and
	 * logout happens through the shell bar's avatar menu; the app's own Logout button — the
	 * only caller of this method — is hidden when embedded (FLP_MIGRATION.md 3.3), so an
	 * `isInLaunchpad()` branch was unreachable code and was deleted. See 3.4.
	 *
	 * Known gap, unchanged by that deletion: on the **ABAP standalone** URL "/logout" does not
	 * exist — it is an approuter endpoint — so that host has been 404ing on logout all along.
	 *
	 * Standalone on BTP, "/logout" is the approuter's central logout endpoint: it clears the
	 * approuter session cookie and the XSUAA session, then redirects to the configured
	 * logoutPage. A plain reload cannot do this — the session cookie survives it, so the
	 * approuter re-serves the app and the user appears stuck logged in.
	 *
	 * The live logoutPage is "/logout.html", from approuter/xs-app.json. Note the root
	 * xs-app.json still says "/" — it is bundled into the app zip but is not what the
	 * standalone approuter reads (FLP_MIGRATION.md deferred finding A). Locally
	 * ui5-middleware-sap-proxy mirrors /logout as a redirect to /logout.html, so this branch
	 * is exercisable with npm start.
	 *
	 * Isolated for unit tests so the QUnit page is not navigated under the runner.
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
}
