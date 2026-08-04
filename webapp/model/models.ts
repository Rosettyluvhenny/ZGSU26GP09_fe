import Device from 'sap/ui/Device';
import BindingMode from 'sap/ui/model/BindingMode';
import JSONModel from 'sap/ui/model/json/JSONModel';

import { isInLaunchpad } from '../services/Launchpad';
import { readSessionStorage, readThemePreference } from '../services/SessionStorage';
import type { SessionData } from './types';

const EMPTY_SESSION: SessionData = {
	authenticated: false,
	userName: '',
	csrfToken: '',
	loginAt: null
};

export default {
	createDeviceModel: (): JSONModel => {
		const model = new JSONModel(Device);
		model.setDefaultBindingMode(BindingMode.OneWay);
		return model;
	},

	createSessionModel: (): JSONModel => {
		return new JSONModel(readSessionStorage(EMPTY_SESSION));
	},

	createUiModel: (): JSONModel => {
		const model = new JSONModel({
			busy: false,
			layout: 'OneColumn',
			currentSection: 'home',
			selectedRegistryId: '',
			selectedJobId: '',
			loginBusy: false,
			searchRegistry: '',
			searchJob: '',
			selectedRegistryStatus: 'All',
			isDarkTheme: (readThemePreference() ?? 'sap_horizon').includes('dark'),
			sideNavVisible: true,
			isPhoneWidth: window.matchMedia('(max-width: 599px)').matches,
			isNarrowWidth: window.matchMedia('(max-width: 1023px)').matches,
			canExecuteScanJob: false,
			canCreate: false,
			canUpdate: false,
			permissionsLoaded: false,
			// Whether the app is embedded in a Fiori Launchpad. Read once here rather than
			// per view: the shell bootstraps before the app Component, so this cannot change
			// during the session, and a model flag keeps the views free of sap.ushell checks.
			// Drives the shell header (MainShell.view.xml) — see FLP_MIGRATION.md 3.3.
			isInLaunchpad: isInLaunchpad()
		});
		model.setDefaultBindingMode(BindingMode.TwoWay);
		return model;
	}
};
