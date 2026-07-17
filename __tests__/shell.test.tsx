/**
 * End-to-end shell smoke: GenOS mounted whole, driven through the real
 * HomeScreen ask bar. Commands launch apps, streams settle into rendered
 * screens, and "close this app" tears the session down through the store.
 * The stream is mocked with handler capture; everything else is real.
 */

// The real handler contract - a locally redeclared mock shape would drift.
import type { StreamHandlers } from "../src/genos/stream";

const launches: Array<{ handlers: StreamHandlers }> = [];
jest.mock("../src/genos/stream", () => ({
  NEEDS_LIVE_DATA: "needs live data",
  streamScreen: jest.fn((_messages: unknown, handlers: StreamHandlers) => {
    launches.push({ handlers });
  }),
}));

import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
// eslint-disable-next-line import/first
import { cerebrasKey } from "../src/config";
// eslint-disable-next-line import/first
import GenOS from "../src/genos/GenOS";
// eslint-disable-next-line import/first
import { screenStore } from "../src/genos/store";
// eslint-disable-next-line import/first
import { textOf } from "../test-utils";

function askBar(tree: ReactTestRenderer): ReactTestInstance {
  const input = tree.root.findAll(
    (n) => typeof n.type === "string" && n.props?.placeholder === "Ask for anything…",
  )[0];
  if (!input) throw new Error("ask bar not found");
  return input;
}

function command(tree: ReactTestRenderer, text: string) {
  act(() => askBar(tree).props.onChangeText(text));
  act(() => askBar(tree).props.onSubmitEditing({ nativeEvent: { text } }));
}

beforeAll(async () => {
  await cerebrasKey.set("csk-test-key");
});

it("launches an app from a command, settles its stream, and closes it through the store", () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <GenOS />
      </SafeAreaProvider>,
    );
  });

  // "open settings" routes to the known Settings app and starts a stream.
  command(tree, "open settings");
  expect(launches).toHaveLength(1);
  expect(textOf(tree.root)).toContain("materializing");

  // The stream settles - the generated screen renders through the shell.
  act(() => {
    launches[0].handlers.onDelta('root = Card([h])\nh = CardHeader("Settings", "All systems go")');
    launches[0].handlers.onDone({ truncated: false, dropped: false });
  });
  expect(textOf(tree.root)).toContain("All systems go");
  expect(screenStore.all().some((s) => s.appId === "settings")).toBe(true);

  // "close this app" ends the session AND evicts the store state.
  command(tree, "close this app");
  expect(screenStore.all().some((s) => s.appId === "settings")).toBe(false);
  expect(textOf(tree.root)).not.toContain("All systems go");

  act(() => tree.unmount());
});
