/**
 * Composite abort for network work: the caller's signal (navigation/close)
 * plus an absolute timeout and an optional idle timeout. Kept dependency-free
 * (no AbortSignal.any - Hermes support varies) and shared by the Cerebras
 * stream and the Exa search fetch, which otherwise could hang forever.
 */
export interface Watchdog {
  /** Pass to fetch - aborts on caller abort OR timeout. */
  signal: AbortSignal;
  /** Call on every received chunk to reset the idle window. */
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
  let idleTimer: ReturnType<typeof setTimeout> | null = opts.idleMs
    ? setTimeout(trip, opts.idleMs)
    : null;

  return {
    signal: controller.signal,
    touch() {
      if (!opts.idleMs) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(trip, opts.idleMs);
    },
    get timedOut() {
      return timedOut;
    },
    dispose() {
      clearTimeout(totalTimer);
      if (idleTimer) clearTimeout(idleTimer);
      opts.signal?.removeEventListener("abort", onCallerAbort);
    },
  };
}
