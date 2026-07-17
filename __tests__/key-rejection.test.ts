/**
 * Key-rejection semantics: only a 401 means the key itself is bad. A 403
 * (WAF, entitlement, region) must keep the stored key and surface the
 * provider's reason - wiping it trapped users in a re-enter loop.
 */

jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

const mockFetch = jest.fn();
jest.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

import { cerebrasKey } from "../src/config";
import { streamScreen } from "../src/genos/stream";

function respond(status: number, bodyText: string) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    body: null,
    text: async () => bodyText,
  });
}

async function runToError(): Promise<Error> {
  return new Promise((resolve, reject) => {
    streamScreen([{ role: "user", content: "hi" }], {
      onDelta: jest.fn(),
      onDone: () => reject(new Error("unexpected onDone")),
      onError: resolve,
    });
  });
}

beforeEach(async () => {
  mockFetch.mockReset();
  await cerebrasKey.set("csk-valid-key");
});

describe("Cerebras auth failures", () => {
  it("401 wipes the key and re-shows the gate", async () => {
    respond(401, "");
    const err = await runToError();
    expect(err.message).toContain("enter a valid key");
    expect(cerebrasKey.get()).toBeNull();
    expect(cerebrasKey.getStatus()).toBe("rejected");
  });

  it("403 keeps the key and surfaces the provider's reason", async () => {
    respond(403, "blocked by region policy");
    const err = await runToError();
    expect(err.message).toContain("403");
    expect(err.message).toContain("blocked by region policy");
    expect(cerebrasKey.get()).toBe("csk-valid-key");
    expect(cerebrasKey.getStatus()).toBe("present");
  });

  it("a stale 401 cannot wipe a key the user already replaced", async () => {
    // The in-flight stream saw the OLD key; by the time it errors, the user
    // has entered a new one - markRejected must no-op.
    await cerebrasKey.set("csk-new-key");
    cerebrasKey.markRejected("csk-valid-key");
    expect(cerebrasKey.get()).toBe("csk-new-key");
    expect(cerebrasKey.getStatus()).toBe("present");
  });
});
