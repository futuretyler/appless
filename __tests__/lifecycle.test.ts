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

interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: (info: { truncated: boolean; dropped: boolean }) => void;
  onError: (err: Error) => void;
  onToolRound?: (calls: unknown[]) => "continue" | "abort";
  signal?: AbortSignal;
}

const launches: Array<{ messages: unknown; handlers: StreamHandlers }> = [];
jest.mock("../src/genos/stream", () => ({
  NEEDS_LIVE_DATA: "needs live data",
  streamScreen: jest.fn((messages: unknown, handlers: StreamHandlers) => {
    launches.push({ messages, handlers });
  }),
}));

import {
  closeApp,
  openApp,
  resolveAction,
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

    closeApp("notes");
    expect(screenStore.get(child)).toBeUndefined();

    const reopened = openApp(makeApp("notes"));
    expect(reopened).not.toBe(id);
    expect(screenStore.get(reopened)?.status).toBe("pending");
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
