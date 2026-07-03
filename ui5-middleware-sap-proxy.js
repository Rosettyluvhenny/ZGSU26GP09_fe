const TARGET_PREFIX = '/sap/opu/odata4/sap/zsb_gsugp9/srvd_a2x/sap/zsr_registry/0001';
const TARGET_BASE_URL = 'https://s40lp1.ucc.cit.tum.de';

const hopByHopHeaders = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
]);

function copyHeaders(source, target) {
	for (const [key, value] of source.entries()) {
		if (!hopByHopHeaders.has(key.toLowerCase())) {
			target.setHeader(key, value);
		}
	}
}

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
			const headers = new Headers();
			for (const [key, value] of Object.entries(req.headers)) {
				if (value !== undefined && !hopByHopHeaders.has(key.toLowerCase()) && key.toLowerCase() !== 'host') {
					headers.set(key, Array.isArray(value) ? value.join(',') : value);
				}
			}

			const response = await fetch(targetUrl, {
				method: req.method,
				headers,
				body,
				redirect: 'manual'
			});

			res.statusCode = response.status;
			copyHeaders(response.headers, res);
			res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
			res.setHeader('Access-Control-Allow-Credentials', 'true');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, If-Match, Accept, Origin, Authorization, sap-client');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
