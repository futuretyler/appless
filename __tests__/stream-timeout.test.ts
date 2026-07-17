/**
 * Streaming timeout seam: a connection that stops delivering chunks must
 * surface a retryable error instead of stranding the screen forever, while
 * a caller abort (navigation/close) stays silent.
 */

// A fetch whose body hangs: read() only settles when the signal aborts -
// exactly how a dead connection behaves under expo/fetch.
jest.mock("expo/fetch", () => ({
  fetch: jest.fn((_url: string, init: { signal: AbortSignal }) =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: () =>
            new Promise((_resolve, reject) => {
              const fail = () => reject(new Error("Aborted"));
              if (init.signal.aborted) fail();
              else init.signal.addEventListener("abort", fail);
            }),
        }),
      },
    }),
  ),
}));

import { cerebrasKey } from "../src/config";
import { streamScreen } from "../src/genos/stream";

beforeAll(async () => {
  await cerebrasKey.set("csk-test-key");
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const flush = async () => {
  // Let promise chains between timer steps settle under fake timers.
  await Promise.resolve();
  await Promise.resolve();
};

describe("stream timeouts", () => {
  it("surfaces a hung stream as a retryable timeout error", async () => {
    const onError = jest.fn();
    const onDone = jest.fn();
    streamScreen([{ role: "user", content: "hi" }], {
      onDelta: jest.fn(),
      onDone,
      onError,
    });
    await flush();

    await jest.advanceTimersByTimeAsync(15_000); // idle window
    await flush();

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/timed out/);
  });

  it("stays silent when the caller aborts (navigation/close)", async () => {
    const onError = jest.fn();
    const onDone = jest.fn();
    const controller = new AbortController();
    streamScreen([{ role: "user", content: "hi" }], {
      onDelta: jest.fn(),
      onDone,
      onError,
      signal: controller.signal,
    });
    await flush();

    controller.abort();
    await flush();
    await jest.advanceTimersByTimeAsync(120_000);
    await flush();

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
