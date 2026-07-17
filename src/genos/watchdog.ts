/**
 * Composite abort for network work: the caller's signal (navigation/close)
 * plus an absolute timeout and an optional idle timeout. Kept dependency-free
 * (no AbortSignal.any - Hermes support varies) and shared by the Cerebras
 * stream and the Exa search fetch, which otherwise could hang forever.
 */
export interface Watchdog {
  /** Pass to fetch - aborts on caller abort OR timeout. */
  signal: AbortSignal;
  /**
   * Call when the response starts and on every received chunk. The idle
   * window ARMS on the first call - before that, only the absolute cap
   * applies, so a queued request with slow TTFB isn't killed as "idle".
   */
  touch(): void;
  /** True when the abort came from a timeout, not the caller. */
  readonly timedOut: boolean;
  /** Clear timers and listeners - call in finally. */
  dispose(): void;
}

export function createWatchdog(opts: {
  signal?: AbortSignal;
  totalMs: number;
  idleMs?: number;
}): Watchdog {
  const controller = new AbortController();
  let timedOut = false;
  const trip = () => {
    timedOut = true;
    controller.abort();
  };
  const onCallerAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort);

  const totalTimer = setTimeout(trip, opts.totalMs);
  // Armed lazily by the first touch() - pre-first-byte waiting is bounded
  // by totalMs alone.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  let disposed = false;
  return {
    signal: controller.signal,
    touch() {
      if (disposed || !opts.idleMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(trip, opts.idleMs);
    },
    get timedOut() {
      return timedOut;
    },
    dispose() {
      disposed = true;
      clearTimeout(totalTimer);
      if (idleTimer) clearTimeout(idleTimer);
      opts.signal?.removeEventListener("abort", onCallerAbort);
    },
  };
}
