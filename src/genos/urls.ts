/**
 * URL handling for model-produced links. Everything here is a trust
 * boundary: URLs arrive from generated programs (and, via web_search
 * snippets, from arbitrary pages), so nothing dispatches without parsing
 * and an allowlist. Kept dependency-free for testability.
 */

/**
 * genos:// deep links parsed by hand - Hermes' URL support for custom
 * schemes varies, and the shape is tiny: genos://cmd?key=value&…
 */
export function parseGenosUrl(url: string): { cmd: string; params: Record<string, string> } | null {
  const m = url.match(/^genos:\/\/([a-z]+)\/?(?:\?(.*))?$/i);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const pair of (m[2] ?? "").split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    try {
      params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      params[k] = v;
    }
  }
  return { cmd: m[1].toLowerCase(), params };
}

/**
 * Only plain web links may leave the app. Model output is untrusted, so
 * tel:/sms:/intent:/file:/custom schemes dispatched from a generated tap
 * are dialer/phishing primitives, not features. Userinfo URLs are rejected
 * outright: "https://google.com@evil.io" navigates to evil.io while reading
 * as google.com in a confirmation dialog - legitimate generated links never
 * carry credentials.
 */
export function isSafeExternalUrl(url: string): boolean {
  const t = url.trim();
  return /^https?:\/\/\S+$/i.test(t) && !/[\n\r]/.test(url) && !/^https?:\/\/[^/?#]*@/i.test(t);
}

/** Display host for the leave-the-app confirmation (userinfo stripped). */
export function externalHost(url: string): string {
  return url.trim().match(/^https?:\/\/(?:[^/?#]*@)?([^/?#]+)/i)?.[1] ?? url.trim();
}
