const TARGET_PREFIX = '/sap/opu/odata4/sap/zsb_gsugp9/srvd_a2x/sap/zsr_registry/0001';
const TARGET_BASE_URL = 'https://s40lp1.ucc.cit.tum.de';

// Only strip headers that are truly TCP-level and cannot be forwarded
const hopByHopHeaders = new Set([
	'connection',
	'keep-alive',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
]);

async function readBody(req) {
	if (req.method === 'GET' || req.method === 'HEAD') {
		return undefined;
	}

	const chunks = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return chunks.length ? Buffer.concat(chunks) : undefined;
}

module.exports = function sapProxy() {
	return async function proxyMiddleware(req, res, next) {
		if (!req.url || !req.url.startsWith(TARGET_PREFIX)) {
			next();
			return;
		}

		const targetUrl = `${TARGET_BASE_URL}${req.url}`;
		try {
			const body = await readBody(req);

			// Forward all request headers to the backend, except host and hop-by-hop
			const reqHeaders = new Headers();
			for (const [key, value] of Object.entries(req.headers)) {
				const lkey = key.toLowerCase();
				if (value !== undefined && !hopByHopHeaders.has(lkey) && lkey !== 'host') {
					reqHeaders.set(key, Array.isArray(value) ? value.join(',') : value);
				}
			}

			const response = await fetch(targetUrl, {
				method: req.method,
				headers: reqHeaders,
				body,
				redirect: 'manual'
			});

			// Forward status code verbatim
			res.statusCode = response.status;

			// Forward ALL response headers from the backend verbatim,
			// only skipping true hop-by-hop headers
			for (const [key, value] of response.headers.entries()) {
				if (!hopByHopHeaders.has(key.toLowerCase())) {
					res.setHeader(key, value);
				}
			}

			// Collect all backend header names to expose them via CORS
			const exposedHeaders = [...response.headers.keys()]
				.filter(k => !hopByHopHeaders.has(k.toLowerCase()))
				.join(', ');

			// Add CORS headers so the browser can actually read the response
			res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
			res.setHeader('Access-Control-Allow-Credentials', 'true');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, If-Match, Accept, Origin, Authorization, sap-client');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
			if (exposedHeaders) {
				res.setHeader('Access-Control-Expose-Headers', exposedHeaders);
			}

			if (req.method === 'OPTIONS') {
				res.end();
				return;
			}

			const arrayBuffer = await response.arrayBuffer();
			res.end(Buffer.from(arrayBuffer));
		} catch (error) {
			res.statusCode = 502;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Proxy request failed', message: error?.message ?? String(error) }));
		}
	};
};
