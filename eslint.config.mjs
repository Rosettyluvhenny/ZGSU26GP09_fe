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
		// webapp/test/** is excluded from tsconfig.json, so the type-aware rules have no
		// program to resolve it against and the parser fails outright ("file was not found
		// in any of the provided project(s)"). Ignoring it here keeps the two configs in
		// agreement — lint reports real findings instead of one permanent parser error.
		// If the QUnit suite is ever made runnable (see ui5-coverage.yaml), drop the
		// tsconfig exclude and this ignore together.
		ignores: ["eslint.config.mjs", "webapp/test/**"]
	}
);
