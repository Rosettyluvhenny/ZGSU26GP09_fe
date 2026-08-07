import type {SuiteConfiguration} from "sap/ui/test/starter/config";
export default {
	name: "QUnit test suite for the UI5 Application: com.zgp09.fe",
	defaults: {
		page: "ui5://test-resources/com/zgp9/fe/Test.qunit.html?testsuite={suite}&test={name}",
		qunit: {
			version: 2
		},
		sinon: {
			version: 4
		},
		ui5: {
			language: "EN",
			theme: "sap_horizon"
		},
		coverage: {
			only: ["com/zgp9/fe/"],
			never: ["test-resources/com/zgp9/fe/"]
		},
		loader: {
			paths: {
				"com/zgp9/fe": "../"
			}
		}
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for com.zgp09.fe"
		}
	}
} satisfies SuiteConfiguration;
