// Optional request proxy.
//
// The data is now fetched server-side by scripts/build-data.mjs (Node), where
// the cinema endpoints can be called directly — there is no browser CORS check.
// A proxy is therefore off by default; set the CORS_PROXY env var only if a host
// needs to be routed through a cors-anywhere-style proxy from the CI runner.

export function getProxy() {
  if (typeof process !== "undefined" && process.env && process.env.CORS_PROXY)
    return process.env.CORS_PROXY.trim();
  return "";
}

export function viaProxy(targetUrl) {
  let base = getProxy();
  if (!base) return targetUrl;
  if (!base.endsWith("/")) base += "/";
  return base + targetUrl;
}
