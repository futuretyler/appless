/**
 * Switcher previews: miniatures must not instantiate WebView-backed maps,
 * and mid-generation screens must be rendered as streaming (partial)
 * programs, not passed off as complete.
 */

jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("../src/genos/stream", () => ({
  NEEDS_LIVE_DATA: "needs live data",
  streamScreen: jest.fn(),
}));

const mockWebView = jest.fn((_props: unknown) => null);
jest.mock("react-native-webview", () => ({
  WebView: (props: unknown) => mockWebView(props),
}));

import { Renderer } from "@openuidev/react-lang";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
// eslint-disable-next-line import/first
import { Switcher } from "../src/genos/shell/Switcher";
// eslint-disable-next-line import/first
import { screenStore, type Screen } from "../src/genos/store";

const screen = (partial: Partial<Screen> & { id: string; content: string }): Screen => ({
  appId: "maps",
  appName: "Maps",
  request: "open maps",
  status: "done",
  speculative: false,
  startedAt: 0,
  ...partial,
});

const MAP_PROGRAM = 'root = Card([m])\nm = MapView("Bengaluru city center", 13)';

function renderSwitcher(apps: Array<{ id: string; screenId: string }>): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <Switcher
        apps={apps.map((a) => ({
          id: a.id,
          name: a.id,
          emoji: "🗺️",
          tile: ["#000", "#111"],
        }))}
        topScreenId={(appId) => apps.find((a) => a.id === appId)?.screenId}
        onResume={() => {}}
        onClose={() => {}}
        onDismiss={() => {}}
      />,
    );
  });
  return tree;
}

beforeEach(() => mockWebView.mockClear());

describe("Switcher previews", () => {
  it("renders map placeholders instead of WebView embeds", () => {
    screenStore.upsert(screen({ id: "s-map", content: MAP_PROGRAM }));
    const tree = renderSwitcher([{ id: "maps", screenId: "s-map" }]);

    expect(mockWebView).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("🗺️");
    act(() => tree.unmount());
  });

  it("marks mid-generation previews as streaming", () => {
    screenStore.upsert(
      screen({ id: "s-live", content: MAP_PROGRAM.slice(0, 20), status: "streaming" }),
    );
    const tree = renderSwitcher([{ id: "maps", screenId: "s-live" }]);

    const renderers = tree.root.findAllByType(Renderer);
    expect(renderers).toHaveLength(1);
    expect(renderers[0].props.isStreaming).toBe(true);
    act(() => tree.unmount());
  });
});
