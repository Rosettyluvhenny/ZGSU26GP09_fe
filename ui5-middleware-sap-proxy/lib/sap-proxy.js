const TARGET_PREFIX = "/sap/opu/odata4/sap/zsb_gsugp9/srvd_a2x/sap/zsr_registry/0001";
const TARGET_BASE_URL = "https://s40lp1.ucc.cit.tum.de";
const LOGIN_ENDPOINT = "/auth/login";
const SESSION_COOKIE_NAME = "zgp9_session";

const hopByHopHeaders = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"content-encoding",
	"content-length"
]);

const sessionCookies = new Map();

function addCorsHeaders(req, res) {
	const origin = req.headers.origin || "*";
	res.setHeader("Access-Control-Allow-Origin", origin);
	res.setHeader("Access-Control-Allow-Credentials", "true");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, If-Match, Accept, Origin, Authorization, sap-client");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
	res.setHeader("Vary", "Origin");
}

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

function parseBasicCredentials(authorization) {
	if (!authorization || !authorization.startsWith("Basic ")) {
		return null;
	}

	try {
		const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
		const separator = decoded.indexOf(":");
		if (separator < 0) {
			return null;
		}

		return {
			userName: decoded.slice(0, separator),
			password: decoded.slice(separator + 1)
		};
	} catch {
		return null;
	}
}

function toSetCookieArray(headers) {
	if (typeof headers.getSetCookie === "function") {
		return headers.getSetCookie();
	}

	const raw = headers.get("set-cookie");
	if (!raw) {
		return [];
	}

	return raw.split(/,(?=\s*[^;=]+=[^;]+)/g).map((value) => value.trim()).filter(Boolean);
}

function setCookiePairs(setCookieHeaders) {
	return setCookieHeaders
		.map((cookie) => cookie.split(";", 1)[0].trim())
		.filter(Boolean);
}

function cookieHeaderFromPairs(setCookieHeaders) {
	const pairs = setCookiePairs(setCookieHeaders);
	return pairs.join("; ");
}

function parseCookieHeader(cookieHeader) {
	const result = {};
	if (!cookieHeader) {
		return result;
	}

	for (const part of cookieHeader.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (!name || rest.length === 0) {
			continue;
		}
		result[name] = rest.join("=");
	}
	return result;
}

function getSessionId(req) {
	const cookies = parseCookieHeader(req.headers.cookie || "");
	return cookies[SESSION_COOKIE_NAME] || "";
}

function setResponseCookies(res, cookies) {
	if (!cookies || cookies.length === 0) {
		return;
	}

	res.setHeader("Set-Cookie", cookies);
}

function localSessionCookie(sessionId) {
	return `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax`;
}

function storeBackendCookies(sessionId, headers) {
	const cookies = toSetCookieArray(headers);
	if (cookies.length > 0) {
		sessionCookies.set(sessionId, cookies);
	}
}

async function fetchWithRedirects(targetUrl, init, maxRedirects = 5) {
	let currentUrl = targetUrl;
	let response = null;

	for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
		response = await fetch(currentUrl, {
			...init,
			redirect: "manual"
		});

		if (![301, 302, 303, 307, 308].includes(response.status)) {
			return response;
		}

		const location = response.headers.get("location");
		if (!location) {
			return response;
		}

		currentUrl = new URL(location, currentUrl).toString();
	}

	return response;
}

async function handleLogin(req, res) {
	const bodyBuffer = await readBody(req);
	let userName = "";
	let password = "";

	const authorization = req.headers.authorization;
	const credentials = parseBasicCredentials(authorization);
	if (credentials) {
		userName = credentials.userName;
		password = credentials.password;
	} else if (bodyBuffer && bodyBuffer.length > 0) {
		try {
			const parsed = JSON.parse(bodyBuffer.toString("utf8"));
			userName = parsed.userName || parsed.username || "";
			password = parsed.password || "";
		} catch {
			// ignore
		}
	}

	if (!userName || !password) {
		res.statusCode = 400;
		res.setHeader("Content-Type", "application/json");
		addCorsHeaders(req, res);
		res.end(JSON.stringify({ error: "Username and password are required." }));
		return;
	}

	const targetUrl = `${TARGET_BASE_URL}${TARGET_PREFIX}?sap-client=324`;
	const response = await fetchWithRedirects(targetUrl, {
		method: "GET",
		headers: {
			Authorization: `Basic ${Buffer.from(`${userName}:${password}`).toString("base64")}`,
			"X-CSRF-Token": "Fetch",
			Accept: "application/json"
		}
	});

	if (!response.ok) {
		res.statusCode = 401;
		res.setHeader("Content-Type", "application/json");
		addCorsHeaders(req, res);
		res.end(JSON.stringify({ error: "Invalid username or password.", status: response.status }));
		return;
	}

	const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	const backendCookies = toSetCookieArray(response.headers);
	storeBackendCookies(sessionId, response.headers);
	setResponseCookies(res, [...backendCookies, localSessionCookie(sessionId)]);

	res.statusCode = 200;
	res.setHeader("Content-Type", "application/json");
	addCorsHeaders(req, res);
	res.end(JSON.stringify({
		authenticated: true,
		userName,
		csrfToken: response.headers.get("x-csrf-token") || response.headers.get("X-CSRF-Token") || "",
		eTag: response.headers.get("etag") || ""
	}));
}

module.exports = function () {
	return async function proxyMiddleware(req, res, next) {
		if (!req.url) {
			next();
			return;
		}

		if (req.url === LOGIN_ENDPOINT || req.url.startsWith(`${LOGIN_ENDPOINT}?`)) {
			try {
				if (req.method === "OPTIONS") {
					addCorsHeaders(req, res);
					res.statusCode = 204;
					res.end();
					return;
				}

				await handleLogin(req, res);
			} catch (error) {
				res.statusCode = 502;
				res.setHeader("Content-Type", "application/json");
				addCorsHeaders(req, res);
				res.end(JSON.stringify({ error: "Login proxy failed", message: error?.message ?? String(error) }));
			}
			return;
		}

		if (!req.url.startsWith(TARGET_PREFIX)) {
			next();
			return;
		}

		const targetUrl = req.url.includes("sap-client=") ? `${TARGET_BASE_URL}${req.url}` : `${TARGET_BASE_URL}${req.url}${req.url.includes("?") ? "&" : "?"}sap-client=324`;
		try {
			const body = await readBody(req);
			const headers = new Headers();
			for (const [key, value] of Object.entries(req.headers)) {
				if (value !== undefined && !hopByHopHeaders.has(key.toLowerCase()) && key.toLowerCase() !== "host") {
					headers.set(key, Array.isArray(value) ? value.join(",") : value);
				}
			}

			const sessionId = getSessionId(req);
			const storedCookies = sessionId ? sessionCookies.get(sessionId) : null;
			if (storedCookies && storedCookies.length > 0) {
				headers.set("cookie", cookieHeaderFromPairs(storedCookies));
			}

			const response = await fetch(targetUrl, {
				method: req.method,
				headers,
				body,
				redirect: "follow"
			});

			res.statusCode = response.status;
			for (const [key, value] of response.headers.entries()) {
				if (!hopByHopHeaders.has(key.toLowerCase()) && key.toLowerCase() !== "www-authenticate") {
					res.setHeader(key, value);
				}
			}

			const responseSetCookies = toSetCookieArray(response.headers);
			if (sessionId && responseSetCookies.length > 0) {
				sessionCookies.set(sessionId, responseSetCookies);
			}
			setResponseCookies(res, responseSetCookies);

			addCorsHeaders(req, res);

			if (req.method === "OPTIONS") {
				res.end();
				return;
			}

			const arrayBuffer = await response.arrayBuffer();
			res.end(Buffer.from(arrayBuffer));
		} catch (error) {
			res.statusCode = 502;
			res.setHeader("Content-Type", "application/json");
			addCorsHeaders(req, res);
			res.end(JSON.stringify({ error: "Proxy request failed", message: error?.message ?? String(error) }));
		}
	};
};

