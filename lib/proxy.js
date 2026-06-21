// Shared CORS-proxy helper.
//
// The cinema endpoints send no `Access-Control-Allow-Origin` header, so a
// browser cannot call them directly. Requests are routed through a
// cors-anywhere-style proxy. The proxy URL is configurable via
// localStorage("cc_proxy"); there is no visible field.

const DEFAULT_PROXY = "https://cors-anywhere.herokuapp.com/";

export function getProxy() {
  return (localStorage.getItem("cc_proxy") || DEFAULT_PROXY).trim();
}

export function viaProxy(targetUrl) {
  let base = getProxy();
  if (base && !base.endsWith("/")) base += "/";
  return base + targetUrl;
}
