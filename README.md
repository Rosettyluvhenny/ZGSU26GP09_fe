# UI5 Application com.zgp9.fe

Insert the purpose of this project and some interesting info here...

## Description

This app uses a TypeScript setup for developing UI5 applications. The central entry point for all information about using TypeScript with UI5 is at [https://ui5.github.io/typescript](https://ui5.github.io/typescript).

See [`SAP-samples/ui5-typescript-helloworld`](https://github.com/SAP-samples/ui5-typescript-helloworld) for a similar sample app including documentation how all the bits and pieces fit together.

## Requirements

Either [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/) for dependency management.

## Preparation

Use `npm` (or `yarn`) to install the dependencies:

```sh
npm install
```

(To use yarn, just do `yarn` instead.)

## Run the App

Execute the following command to run the app locally for development in watch mode (the browser reloads the app automatically when there are changes in the source code):

```sh
npm start
```

As shown in the terminal after executing this command, the app is then running on http://localhost:8080/index.html. A browser window with this URL should automatically open.

(When using yarn, do `yarn start` instead.)

## Debug the App

In the browser, you can directly debug the original TypeScript code, which is supplied via sourcemaps (need to be enabled in the browser's developer console if it does not work straight away). If the browser doesn't automatically jump to the TypeScript code when setting breakpoints, use e.g. `Ctrl`/`Cmd` + `P` in Chrome to open the `*.ts` file you want to debug.

## Build the App

### Unoptimized (but quick)

Execute the following command to build the project and get an app that can be deployed:

```sh
npm run build
```

The result is placed into the `dist` folder. To start the generated package, just run

```sh
npm run start:dist
```

Note that `index.html` still loads the UI5 framework from the relative URL `resources/...`, which does not physically exist, but is only provided dynamically by the UI5 tooling. So for an actual deployment you should change this URL to either [the CDN](https://sdk.openui5.org/#/topic/2d3eb2f322ea4a82983c1c62a33ec4ae) or your local deployment of UI5.

(When using yarn, do `yarn build` and `yarn start:dist` instead.)

### Optimized

For an optimized self-contained build (takes longer because the UI5 resources are built, too), do:

```sh
npm run build:opt
```

To start the generated package, again just run:

```sh
npm run start:dist
```

In this case, all UI5 framework resources are also available within the `dist` folder, so the folder can be deployed as-is to any static web server, without changing the bootstrap URL.

With the self-contained build, the bootstrap URL in `index.html` has already been modified to load the newly created `sap-ui-custom.js` for bootstrapping, which contains all app resources as well as all needed UI5 JavaScript resources. Most UI5 resources inside the `dist` folder are for this reason actually **not** needed to run the app. Only the non-JS-files, like translation texts and CSS files, are used and must also be deployed. (Only when for some reason JS files are missing from the optimized self-contained bundle, they are also loaded separately.)

(When using yarn, do `yarn build:opt` and `yarn start:dist` instead.)

## AI Assistant Configuration

The AI chat calls the providers through the approuter, never directly. The provider
API keys live in BTP destinations and are attached server-side, so **no key is ever
shipped to the browser**. Do not reintroduce a key into `webapp/` — anything under
`webapp/` ends up in `Component-preload.js` and its sourcemaps, readable by any user.

### Local development

```sh
cp .env.example .env   # then paste your keys
npm start
```

`.env` is git-ignored and is read by `ui5-middleware-sap-proxy/lib/sap-proxy.js`, which
serves the same `/ai/...` paths locally that the approuter serves when deployed. The
frontend therefore has no environment-specific branching.

### BTP setup (once per subaccount)

In the BTP Cockpit under **Connectivity → Destinations**, create two destinations:

| Field | `AI_GROQ` | `AI_OPENROUTER` |
| --- | --- | --- |
| URL | `https://api.groq.com/openai/v1` | `https://openrouter.ai/api/v1` |
| Type | HTTP | HTTP |
| Proxy Type | Internet | Internet |
| Authentication | NoAuthentication | NoAuthentication |

On each, add an additional property carrying the key:

```
URL.headers.Authorization = Bearer <your-key>
```

Then assign the **`ZGP9_User`** role collection to anyone who should use the app. It grants
both `$XSAPPNAME.User` and `$XSAPPNAME.AiUser`, so app access and AI access come together.

The AI routes still *check* for `$XSAPPNAME.AiUser` (see the `scope` property in
`xs-app.json`), so access can be split again later by removing that scope from the `User`
role template and giving it its own role collection — no route changes needed.

> **Note:** SAP KBA [3341287](https://userapps.support.sap.com/sap/support/knowledge/en/3341287)
> reports `URL.headers.<name>` being ignored by some *standalone* approuter versions. This
> was verified working on `@sap/approuter` ^15 with the setup above. If a future upgrade
> breaks it, the symptom is a 401 from the provider on **both** routes at once (a single
> route failing is a bad key value instead), and the fix is a small approuter extension
> that injects the header from a CF environment variable.
>
> Do not add comment keys such as `_comment` to `xs-app.json` — the approuter validates it
> against a strict schema and refuses to start on unknown properties.

### Key rotation

Keys rotate entirely in the cockpit — edit the destination property and restart the
approuter. No rebuild, no redeploy, no code change.

Recommended hardening on the provider side, since any `ZGP9_AiUser` can spend the quota:

- Use a dedicated key per environment so rotating prod does not break dev.
- On OpenRouter, set a per-key credit limit with a daily reset. This caps the blast
  radius of any compromise to a known amount.

The approuter routes in `xs-app.json` match **only** `chat/completions`. Keep it that
way: a broader pattern such as `^/ai/openrouter/(.*)$` would also expose the provider's
key-management endpoints (e.g. `GET /api/v1/key`, which returns your credit balance).

## Check the Code

Do the following to run a TypeScript check:

```sh
npm run ts-typecheck
```

This checks the application code for any type errors (but will also complain in case of fundamental syntax issues which break the parsing).

To lint the TypeScript code, do:

```sh
npm run lint
```

(Again, when using yarn, do `yarn ts-typecheck` and `yarn lint` instead.)

## License

This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE](LICENSE) file.
