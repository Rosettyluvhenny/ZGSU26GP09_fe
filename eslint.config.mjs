import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import path from "node:path";
import {fileURLToPath} from "node:url";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				sap: "readonly"
			},
			ecmaVersion: 2023,
			parserOptions: {
				project: true,
				tsconfigRootDir: path.dirname(fileURLToPath(import.meta.url))
			}
		}
	},
	// ── Relaxed rules for test files ──────────────────────────────────────────
	// Sinon stubs return `any`, mock objects don't conform to full UI5 types,
	// and async QUnit callbacks intentionally return Promise<void>.
	{
		files: ["webapp/test/**/*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-function-type": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			// QUnit.test callbacks are typed void but async tests return Promise
			"@typescript-eslint/no-misused-promises": "off"
		}
	},
	{
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", {
				"argsIgnorePattern": "^_",
				"varsIgnorePattern": "^_",
				"caughtErrorsIgnorePattern": "^_"
			}]
		}
	},
	{
		ignores: ["eslint.config.mjs", "webapp/test/e2e/**"]
	}
);
