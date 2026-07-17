/**
 * Telemetry: the opt-out flags must actually suppress the launch event, and
 * the event that does go out must carry only the anonymous id + platform.
 */

jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => "stored-anon-id",
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

const loadTelemetry = (env: Record<string, string | undefined>) => {
  let mod!: typeof import("../src/genos/telemetry");
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  jest.isolateModules(() => {
    mod = require("../src/genos/telemetry");
  });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return mod;
};

const mockFetch = jest.fn(async () => ({ ok: true }));
beforeEach(() => {
  mockFetch.mockClear();
  (globalThis as { fetch: unknown }).fetch = mockFetch;
});

describe("initTelemetry", () => {
  it("sends one anonymous launch event with no PII", async () => {
    const t = loadTelemetry({ EXPO_PUBLIC_POSTHOG_DISABLED: undefined, DO_NOT_TRACK: undefined });
    await t.initTelemetry();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.event).toBe("appless_app_launched");
    expect(body.distinct_id).toBe("stored-anon-id");
    expect(Object.keys(body.properties).sort()).toEqual(["$lib", "platform"]);
  });

  it("EXPO_PUBLIC_POSTHOG_DISABLED=1 suppresses the event", async () => {
    const t = loadTelemetry({ EXPO_PUBLIC_POSTHOG_DISABLED: "1", DO_NOT_TRACK: undefined });
    await t.initTelemetry();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("DO_NOT_TRACK=1 suppresses the event", async () => {
    const t = loadTelemetry({ EXPO_PUBLIC_POSTHOG_DISABLED: undefined, DO_NOT_TRACK: "1" });
    await t.initTelemetry();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
