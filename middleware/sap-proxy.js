const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const TARGET_ORIGIN = "https://s40lp1.ucc.cit.tum.de";
const PROXIED_PREFIXES = ["/sap/"];

function shouldProxy(requestUrl) {
  return PROXIED_PREFIXES.some((prefix) => requestUrl.startsWith(prefix));
}

function forwardHeaders(sourceHeaders) {
  const headers = {};
  const allowed = new Set([
    "accept",
    "accept-language",
    "authorization",
    "cache-control",
    "content-type",
    "cookie",
    "if-match",
    "if-none-match",
    "prefer",
    "x-csrf-token",
    "x-requested-with",
    "x-http-method",
    "x-http-method-override",
  ]);

  for (const [name, value] of Object.entries(sourceHeaders)) {
    if (allowed.has(name.toLowerCase()) && value !== undefined) {
      headers[name] = value;
    }
  }

  return headers;
}

function copyResponseHeaders(source, target) {
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (name.toLowerCase() === "content-length") {
      continue;
    }
    target.setHeader(name, value);
  }
}

function sendCorsLikeHeaders(res, req) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-CSRF-Token, If-Match, If-None-Match, Prefer, X-Requested-With"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS");
}

module.exports = function sapProxyMiddleware() {
  return function proxyMiddleware(req, res, next) {
    const requestUrl = req.url || "/";
    if (!shouldProxy(requestUrl)) {
      next();
      return;
    }

    if (req.method === "OPTIONS") {
      sendCorsLikeHeaders(res, req);
      res.statusCode = 204;
      res.end();
      return;
    }

    const targetUrl = new URL(requestUrl, TARGET_ORIGIN);
    const client = targetUrl.protocol === "http:" ? http : https;
    const outboundHeaders = {
      ...forwardHeaders(req.headers),
      host: targetUrl.host,
    };

    const proxyRequest = client.request(
      targetUrl,
      {
        method: req.method,
        headers: outboundHeaders,
      },
      (proxyResponse) => {
        res.statusCode = proxyResponse.statusCode || 502;
        copyResponseHeaders(proxyResponse.headers, res);
        sendCorsLikeHeaders(res, req);
        proxyResponse.pipe(res);
      }
    );

    proxyRequest.on("error", (error) => {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      sendCorsLikeHeaders(res, req);
      res.end(
        JSON.stringify({
          error: "Proxy request failed",
          message: error.message,
        })
      );
    });

    req.pipe(proxyRequest);
  };
};
