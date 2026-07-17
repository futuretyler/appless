/**
 * Session lifecycle: closing an app must abort its in-flight generations
 * (including speculative prefetch children), evict its screens and index
 * entries, and stay immune to late stream callbacks. streamScreen is mocked
 * with full handler capture so tests drive stream completion by hand.
 */

jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));

// The real handler contract - a locally redeclared mock shape would drift.
import type { StreamHandlers } from "../src/genos/stream";

const launches: Array<{ messages: unknown; handlers: StreamHandlers }> = [];
jest.mock("../src/genos/stream", () => ({
  NEEDS_LIVE_DATA: "needs live data",
  streamScreen: jest.fn((messages: unknown, handlers: StreamHandlers) => {
    launches.push({ messages, handlers });
  }),
}));

import {
  cacheIndexSizes,
  closeApp,
  openApp,
  openDeepLink,
  resolveAction,
  retryScreen,
  screenStore,
  setActiveScreen,
} from "../src/genos/store";

const makeApp = (id: string) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  emoji: "✨",
  tile: ["#000", "#111"] as [string, string],
  request: `Open ${id}`,
});

/** Program whose settled screen offers two prefetchable actions. */
const TWO_ACTIONS = [
  'a = ListItem("A", null, "wifi", null, Action([@ToAssistant("Go to A")]))',
  'b = ListItem("B", null, "bluetooth", null, Action([@ToAssistant("Go to B")]))',
].join("\n");

/** Open an app, make its screen visible, and settle its stream. */
function openAndSettle(appId: string): { id: string; launch: (typeof launches)[number] } {
  const id = openApp(makeApp(appId));
  setActiveScreen(id);
  const launch = launches[launches.length - 1];
  launch.handlers.onDelta(TWO_ACTIONS);
  launch.handlers.onDone({ truncated: false, dropped: false });
  return { id, launch };
}

beforeEach(() => {
  launches.length = 0;
  setActiveScreen(null);
});

describe("closeApp", () => {
  it("aborts the app's in-flight stream and evicts the screen", () => {
    const id = openApp(makeApp("mail"));
    const { handlers } = launches[launches.length - 1];
    expect(handlers.signal?.aborted).toBe(false);

    closeApp("mail");

    expect(handlers.signal?.aborted).toBe(true);
    expect(screenStore.get(id)).toBeUndefined();
  });

  it("aborts speculative prefetch children too", () => {
    const before = launches.length;
    openAndSettle("music");
    // Settling the visible screen fanned out one prefetch per action.
    const spawned = launches.slice(before);
    expect(spawned.length).toBe(3); // home screen + 2 speculative children
    const children = spawned.slice(1); // the home screen's stream already finished
    expect(children.every((l) => l.handlers.signal?.aborted === false)).toBe(true);

    closeApp("music");

    expect(children.every((l) => l.handlers.signal?.aborted === true)).toBe(true);
    expect(screenStore.all().filter((s) => s.appId === "music")).toEqual([]);
  });

  it("evicts the action cache and reopening regenerates fresh", () => {
    const { id } = openAndSettle("notes");
    const child = resolveAction(id, "Go to A");
    expect(screenStore.get(child)).toBeDefined();

    // The index maps must shrink too - screen eviction alone would look
    // identical from the outside (resolveAction self-heals on dangling
    // entries), which is exactly how an eviction revert would hide.
    const before = cacheIndexSizes();
    closeApp("notes");
    const after = cacheIndexSizes();
    expect(after.actions).toBe(before.actions - 2); // both prefetched actions
    expect(after.appHomes).toBe(before.appHomes - 1);

    expect(screenStore.get(child)).toBeUndefined();

    const reopened = openApp(makeApp("notes"));
    expect(reopened).not.toBe(id);
    expect(screenStore.get(reopened)?.status).toBe("pending");
  });

  it("never re-prefetches an action that resolved to an @OS command", () => {
    const before = launches.length;
    const { id: parent } = openAndSettle("radio");
    const children = launches.slice(before + 1);
    expect(children).toHaveLength(2);

    // The first speculative child settles as a bare command.
    children[0].handlers.onDelta("@OS(home)");
    children[0].handlers.onDone({ truncated: false, dropped: false });

    // The orphan is evicted - nothing will ever execute a speculative
    // command screen.
    expect(screenStore.all().filter((s) => s.parentId === parent)).toHaveLength(1);

    // Revisiting the parent must not relaunch the @OS action (the paid
    // regenerate-per-visit loop).
    const relaunchesBefore = launches.length;
    setActiveScreen(null);
    setActiveScreen(parent);
    expect(launches.length).toBe(relaunchesBefore);
  });

  it("ignores late callbacks from aborted streams", () => {
    const id = openApp(makeApp("photos"));
    const { handlers } = launches[launches.length - 1];

    closeApp("photos");

    // A straggling delta/done from the dead stream must not resurrect state.
    handlers.onDelta("late content");
    handlers.onDone({ truncated: false, dropped: false });
    expect(screenStore.get(id)).toBeUndefined();
  });

  it("navigating away cancels sibling prefetches but never the screen the user tapped", () => {
    const before = launches.length;
    const { id: parent } = openAndSettle("browser");
    const [childA, childB] = launches.slice(before + 1);
    expect(childA.handlers.signal?.aborted).toBe(false);
    expect(childB.handlers.signal?.aborted).toBe(false);

    // User taps "Go to A": the shell resolves the action, then reports the
    // child as the new visible screen.
    const tappedId = resolveAction(parent, "Go to A");
    setActiveScreen(tappedId);

    // The tapped screen's stream keeps running; its sibling is cancelled
    // into a silently-errored cache entry.
    expect(childA.handlers.signal?.aborted).toBe(false);
    const siblingId = screenStore.all().find(
      (s) => s.parentId === parent && s.id !== tappedId,
    )!.id;
    expect(childB.handlers.signal?.aborted).toBe(true);
    expect(screenStore.get(siblingId)?.status).toBe("error");

    // Tapping the cancelled action later regenerates it in place, fresh.
    const launchesBefore = launches.length;
    const again = resolveAction(parent, "Go to B");
    expect(again).toBe(siblingId);
    expect(launches.length).toBe(launchesBefore + 1);
    expect(screenStore.get(siblingId)?.status).toBe("pending");
    expect(screenStore.get(siblingId)?.speculative).toBe(false);
  });

  it("never serves @OS command screens from the action cache", () => {
    const { id: parent } = openAndSettle("mailbox");

    // The model answers a navigation-shaped request with a bare command.
    const cmd = resolveAction(parent, "take me home please");
    const launch = launches[launches.length - 1];
    launch.handlers.onDelta("@OS(home)");
    launch.handlers.onDone({ truncated: false, dropped: false });
    expect(screenStore.get(cmd)?.osCommand).toEqual({ cmd: "home", arg: undefined });

    // The shell executes commands once per screen id - a cached hit would be
    // a dead blank frame. The same request must generate (and execute) fresh.
    const again = resolveAction(parent, "take me home please");
    expect(again).not.toBe(cmd);
    expect(screenStore.get(again)?.status).toBe("pending");
  });

  it("never serves @OS command screens from the deep-link cache", () => {
    const first = openDeepLink("timer", "start a 5 minute timer");
    const launch = launches[launches.length - 1];
    launch.handlers.onDelta('@OS(open, "clock")');
    launch.handlers.onDone({ truncated: false, dropped: false });

    const again = openDeepLink("timer", "start a 5 minute timer");
    expect(again).not.toBe(first);
    expect(screenStore.get(again)?.status).toBe("pending");
  });

  it("records provider truncation on the settled screen", () => {
    const id = openApp(makeApp("recipes"));
    const { handlers } = launches[launches.length - 1];
    handlers.onDelta("root = Card([])");
    handlers.onDone({ truncated: true, dropped: false });

    const screen = screenStore.get(id);
    expect(screen?.status).toBe("done");
    expect(screen?.truncated).toBe(true);

    // Regenerating clears the flag until the provider reports it again.
    const relaunches = launches.length;
    retryScreen(id);
    expect(launches.length).toBe(relaunches + 1);
    expect(screenStore.get(id)?.truncated).toBeUndefined();
  });

  it("leaves other apps' sessions untouched", () => {
    const a = openApp(makeApp("alpha"));
    const aHandlers = launches[launches.length - 1].handlers;
    const b = openApp(makeApp("beta"));
    const bHandlers = launches[launches.length - 1].handlers;

    closeApp("alpha");

    expect(aHandlers.signal?.aborted).toBe(true);
    expect(screenStore.get(a)).toBeUndefined();
    expect(bHandlers.signal?.aborted).toBe(false);
    expect(screenStore.get(b)?.appId).toBe("beta");
  });
});
