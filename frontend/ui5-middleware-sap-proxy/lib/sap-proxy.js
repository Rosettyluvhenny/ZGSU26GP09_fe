const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const TARGET_PREFIX = "/sap/opu/odata4/sap/zsb_gsugp9/srvd_a2x/sap/zsr_registry/0001";
const TARGET_BASE_URL = "https://s40lp1.ucc.cit.tum.de";

// Local stand-in for the BTP destinations behind the approuter's /ai routes
// (see approuter/xs-app.json). Same paths in both environments, so the frontend
// never branches on where it is running. Keys come from the git-ignored .env and
// stay on this side of the wire — nothing is ever sent to the browser.
const AI_ROUTES = {
	"/ai/groq/chat/completions": {
		url: "https://api.groq.com/openai/v1/chat/completions",
		envVar: "GROQ_API_KEY",
	},
	"/ai/openrouter/chat/completions": {
		url: "https://openrouter.ai/api/v1/chat/completions",
		envVar: "OPENROUTER_API_KEY",
	},
};

let dotEnvCache = null;

/** Minimal .env reader — avoids a dependency for something only dev uses. */
function readDotEnv() {
	if (dotEnvCache) {
		return dotEnvCache;
	}
	dotEnvCache = {};
	try {
		const raw = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
		for (const line of raw.split("\n")) {
			const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
			if (match) {
				dotEnvCache[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
			}
		}
	} catch {
		// No .env; the AI routes report the missing key on first use.
	}
	return dotEnvCache;
}

async function handleAiRequest(req, res, route) {
	const apiKey = process.env[route.envVar] || readDotEnv()[route.envVar] || "";
	if (!apiKey) {
		res.statusCode = 500;
		res.setHeader("Content-Type", "application/json");
		addCorsHeaders(req, res);
		res.end(
			JSON.stringify({
				error: {
					message: `${route.envVar} is not set. Copy .env.example to .env and add your key (local dev only).`,
				},
			})
		);
		return;
	}

	const body = await readBody(req);
	const response = await fetch(route.url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body,
	});

	res.statusCode = response.status;
	const contentType = response.headers.get("content-type");
	if (contentType) {
		res.setHeader("Content-Type", contentType);
	}
	addCorsHeaders(req, res);
	// Defeat any buffering between here and the browser so SSE chunks arrive live.
	res.setHeader("Cache-Control", "no-cache, no-transform");
	res.setHeader("X-Accel-Buffering", "no");
	res.flushHeaders?.();

	if (!response.body) {
		res.end();
		return;
	}
	// Piped rather than buffered: the chat renders tokens as they stream in.
	Readable.fromWeb(response.body).pipe(res);
}

// Drop only true TCP-level hop-by-hop headers; forward everything else verbatim.
const hopByHopHeaders = new Set([
	"connection",
	"keep-alive",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"content-encoding",
	"content-length",
]);

async function readBody(req) {
	if (req.method === "GET" || req.method === "HEAD") {
		return undefined;
	}

	const chunks = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return chunks.length ? Buffer.concat(chunks) : undefined;
}

function addCorsHeaders(req, res) {
	const origin = req.headers.origin || "*";
	res.setHeader("Access-Control-Allow-Origin", origin);
	res.setHeader("Access-Control-Allow-Credentials", "true");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Content-Type, X-CSRF-Token, If-Match, Accept, Origin, Authorization, sap-client"
	);
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
	res.setHeader("Vary", "Origin");
}

module.exports = function () {
	return async function proxyMiddleware(req, res, next) {
		if (!req.url) {
			next();
			return;
		}

		const aiRoute = AI_ROUTES[req.url.split("?")[0]];
		if (aiRoute) {
			if (req.method === "OPTIONS") {
				addCorsHeaders(req, res);
				res.statusCode = 204;
				res.end();
				return;
			}
			try {
				await handleAiRequest(req, res, aiRoute);
			} catch (error) {
				res.statusCode = 502;
				res.setHeader("Content-Type", "application/json");
				addCorsHeaders(req, res);
				res.end(JSON.stringify({ error: { message: error?.message ?? String(error) } }));
			}
			return;
		}

		// Mirror the approuter's central logout so the frontend uses the same /logout
		// path locally. There is no XSUAA session to end in dev, so we skip straight to
		// the sign-out page the approuter's logoutPage points at, and serve that page
		// from the approuter module's resources so dev and prod look identical.
		const pathname = req.url.split("?")[0];
		if (pathname === "/logout") {
			res.statusCode = 302;
			res.setHeader("Location", "/logout.html");
			res.end();
			return;
		}
		if (pathname === "/logout.html") {
			const logoutPage = path.join(__dirname, "..", "..", "approuter", "resources", "logout.html");
			try {
				const html = fs.readFileSync(logoutPage);
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html; charset=utf-8");
				res.end(html);
			} catch {
				res.statusCode = 302;
				res.setHeader("Location", "/");
				res.end();
			}
			return;
		}

		const isTarget = req.url.startsWith(TARGET_PREFIX);
		const isConvert = req.url.startsWith("/convert/");
		if (!isTarget && !isConvert) {
			next();
			return;
		}

		// Handle pre-flight CORS requests immediately.
		if (req.method === "OPTIONS") {
			addCorsHeaders(req, res);
			res.statusCode = 204;
			res.end();
			return;
		}

		// Append sap-client if not already present.
		let targetUrl;
		if (isConvert) {
			targetUrl = `https://zgsu26gp09schemagenerator-production.up.railway.app${req.url}`;
		} else {
			targetUrl = req.url.includes("sap-client=")
				? `${TARGET_BASE_URL}${req.url}`
				: `${TARGET_BASE_URL}${req.url}${req.url.includes("?") ? "&" : "?"}sap-client=324`;
		}

		try {
			const body = await readBody(req);

			// Forward all request headers verbatim (except hop-by-hop and host).
			const reqHeaders = new Headers();
			for (const [key, value] of Object.entries(req.headers)) {
				const lkey = key.toLowerCase();
				if (value !== undefined && !hopByHopHeaders.has(lkey) && lkey !== "host") {
					reqHeaders.set(key, Array.isArray(value) ? value.join(",") : value);
				}
			}

			const response = await fetch(targetUrl, {
				method: req.method,
				headers: reqHeaders,
				body,
				redirect: "manual",
			});

			// Forward status code verbatim — including 401 so the browser
			// sees the WWW-Authenticate header and shows its native Basic Auth popup.
			res.statusCode = response.status;

			// Forward ALL response headers verbatim (except hop-by-hop).
			// Critically this includes WWW-Authenticate and Set-Cookie.
			for (const [key, value] of response.headers.entries()) {
				if (!hopByHopHeaders.has(key.toLowerCase())) {
					res.setHeader(key, value);
				}
			}

			// Add CORS headers so the browser fetch() can read the response.
			addCorsHeaders(req, res);

			const arrayBuffer = await response.arrayBuffer();
			res.end(Buffer.from(arrayBuffer));
		} catch (error) {
			res.statusCode = 502;
			res.setHeader("Content-Type", "application/json");
			addCorsHeaders(req, res);
			res.end(
				JSON.stringify({
					error: "Proxy request failed",
					message: error?.message ?? String(error),
				})
			);
		}
	};
};
