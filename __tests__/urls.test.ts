/**
 * URL trust boundary: genos:// deep-link parsing and the external-link
 * allowlist that gates Linking.openURL.
 */
import { externalHost, isSafeExternalUrl, parseGenosUrl } from "../src/genos/urls";

describe("parseGenosUrl", () => {
  it("parses commands with query params", () => {
    expect(parseGenosUrl("genos://open?app=music&request=play+jazz")).toEqual({
      cmd: "open",
      params: { app: "music", request: "play jazz" },
    });
  });

  it("parses bare commands and normalizes case", () => {
    expect(parseGenosUrl("genos://HOME")).toEqual({ cmd: "home", params: {} });
    expect(parseGenosUrl("genos://back/")).toEqual({ cmd: "back", params: {} });
  });

  it("decodes percent-encoded params and survives malformed encoding", () => {
    expect(parseGenosUrl("genos://toast?text=Saved%20%E2%9C%93")?.params.text).toBe("Saved ✓");
    expect(parseGenosUrl("genos://toast?text=%E0%A4%A")?.params.text).toBe("%E0%A4%A");
  });

  it("rejects non-genos URLs", () => {
    expect(parseGenosUrl("https://example.com")).toBeNull();
    expect(parseGenosUrl("genos:home")).toBeNull();
  });
});

describe("isSafeExternalUrl", () => {
  it("allows plain web links", () => {
    expect(isSafeExternalUrl("https://example.com/a?b=c")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
    expect(isSafeExternalUrl("HTTPS://EXAMPLE.COM")).toBe(true);
  });

  it("blocks every non-web scheme", () => {
    for (const url of [
      "tel:+15551234567",
      "sms:+15551234567?body=hi",
      "mailto:a@b.com",
      "intent://scan/#Intent;scheme=zxing;end",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,<script>alert(1)</script>",
      "myapp://steal",
      "genos://home",
    ]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });

  it("blocks whitespace smuggling", () => {
    expect(isSafeExternalUrl("https://good.com\nevil")).toBe(false);
    expect(isSafeExternalUrl("https:// example.com")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
    // These pass the trimmed-regex clause and are caught ONLY by the
    // raw-newline guard - they pin that clause independently.
    expect(isSafeExternalUrl("https://good.com\n")).toBe(false);
    expect(isSafeExternalUrl("\nhttps://good.com")).toBe(false);
  });

  it("blocks userinfo URLs that spoof the confirmation host", () => {
    expect(isSafeExternalUrl("https://google.com@evil.io/x")).toBe(false);
    expect(isSafeExternalUrl("https://paypal.com:hunter2@evil.io")).toBe(false);
  });
});

describe("externalHost", () => {
  it("extracts the host for the confirmation dialog", () => {
    expect(externalHost("https://www.example.com/path?q=1")).toBe("www.example.com");
    expect(externalHost("http://sub.domain.io")).toBe("sub.domain.io");
  });

  it("strips userinfo so the dialog can never show a spoofed prefix", () => {
    expect(externalHost("https://google.com@evil.io/x")).toBe("evil.io");
    expect(externalHost("https://user:pass@evil.io")).toBe("evil.io");
  });
});
