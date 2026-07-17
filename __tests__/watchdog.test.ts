/** Watchdog: composite abort = caller signal + absolute + idle timeouts. */
import { createWatchdog } from "../src/genos/watchdog";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("createWatchdog", () => {
  it("trips after the absolute timeout", () => {
    const w = createWatchdog({ totalMs: 1000 });
    expect(w.signal.aborted).toBe(false);
    jest.advanceTimersByTime(1000);
    expect(w.signal.aborted).toBe(true);
    expect(w.timedOut).toBe(true);
    w.dispose();
  });

  it("trips when the idle window elapses without a touch", () => {
    const w = createWatchdog({ totalMs: 60_000, idleMs: 500 });
    jest.advanceTimersByTime(499);
    w.touch();
    jest.advanceTimersByTime(499);
    w.touch();
    expect(w.signal.aborted).toBe(false);
    jest.advanceTimersByTime(500);
    expect(w.signal.aborted).toBe(true);
    expect(w.timedOut).toBe(true);
    w.dispose();
  });

  it("touching cannot outlive the absolute cap", () => {
    const w = createWatchdog({ totalMs: 1000, idleMs: 400 });
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(300);
      w.touch();
    }
    jest.advanceTimersByTime(100); // 1000ms total
    expect(w.signal.aborted).toBe(true);
    expect(w.timedOut).toBe(true);
    w.dispose();
  });

  it("propagates a caller abort without marking it as a timeout", () => {
    const caller = new AbortController();
    const w = createWatchdog({ signal: caller.signal, totalMs: 60_000 });
    caller.abort();
    expect(w.signal.aborted).toBe(true);
    expect(w.timedOut).toBe(false);
    w.dispose();
  });

  it("does not count time before the first touch against the idle window", () => {
    // Slow TTFB: the request is queued, no chunks yet - only the absolute
    // cap may kill it, never the idle window.
    const w = createWatchdog({ totalMs: 60_000, idleMs: 500 });
    jest.advanceTimersByTime(10_000);
    expect(w.signal.aborted).toBe(false);
    w.touch(); // response started - idle window arms now
    jest.advanceTimersByTime(499);
    expect(w.signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(w.signal.aborted).toBe(true);
    expect(w.timedOut).toBe(true);
    w.dispose();
  });

  it("is inert after dispose", () => {
    const w = createWatchdog({ totalMs: 1000, idleMs: 500 });
    w.dispose();
    w.touch(); // must not re-arm the idle timer after dispose
    jest.advanceTimersByTime(60_000);
    expect(w.signal.aborted).toBe(false);
    expect(w.timedOut).toBe(false);
  });
});
