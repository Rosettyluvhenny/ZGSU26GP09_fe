const TARGET_PREFIX = "/sap/opu/odata4/sap/zsb_gsugp9/srvd_a2x/sap/zsr_registry/0001";
const TARGET_BASE_URL = "https://s40lp1.ucc.cit.tum.de";

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
		if (!req.url || !req.url.startsWith(TARGET_PREFIX)) {
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
		const targetUrl = req.url.includes("sap-client=")
			? `${TARGET_BASE_URL}${req.url}`
			: `${TARGET_BASE_URL}${req.url}${req.url.includes("?") ? "&" : "?"}sap-client=324`;

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
