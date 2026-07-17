/**
 * Accessibility semantics through the real Cupertino renderer: alt text
 * must survive to accessibility labels, and interactive elements need
 * roles + selected state. (The Material mirror is asserted in
 * render-material.test.tsx - zod's per-file registry allows one library
 * build per jest file.)
 */
import { Renderer } from "@openuidev/react-lang";
import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

jest.mock("react-native-webview", () => ({ WebView: () => null }));

// eslint-disable-next-line import/first
import { genosLibrary } from "../src/genos/library";

const PROGRAM = `root = Card([header, gallery, hero, chips, tabs, rows, plain])
header = CardHeader("Gallery")
gallery = PhotoGrid([{src: "/api/img?q=beach&seed=1", alt: "Sunset over Baga beach"}, {src: "/api/img?q=fort&seed=2", alt: "Aguada fort walls"}])
hero = ImageBlock("/api/img?q=goa&seed=3", "Weekend in Goa")
chips = Chips(["All", "Beaches", "Forts"])
tabs = Tabs([t1, t2])
t1 = TabItem("Photos", [txt1])
txt1 = TextContent("Photo grid")
t2 = TabItem("Albums", [txt2])
txt2 = TextContent("Album list")
rows = ListBlock([r1])
r1 = ListItem("Baga Beach", "12 photos", {src: "/api/img?q=beach&seed=4", alt: "Baga thumbnail"}, null, Action([@ToAssistant("Open the Baga album")]))
plain = ListItem("Storage used", null, "database", "1.2 GB")`;

let tree: ReactTestRenderer;
beforeAll(() => {
  act(() => {
    tree = create(<Renderer response={PROGRAM} library={genosLibrary} isStreaming={false} />);
  });
});
afterAll(() => act(() => tree.unmount()));

// Host elements only - findAll otherwise matches both the composite
// Pressable and the host View it renders, double-counting every control.
const byRole = (role: string): ReactTestInstance[] =>
  tree.root.findAll((n) => typeof n.type === "string" && n.props?.accessibilityRole === role);

const textOf = (node: ReactTestInstance): string => {
  let out = "";
  const walk = (n: ReactTestInstance | string) => {
    if (typeof n === "string") {
      out += n;
      return;
    }
    for (const child of n.children) walk(child);
  };
  walk(node);
  return out;
};

describe("accessibility semantics (Cupertino)", () => {
  it("carries alt text into image accessibility labels", () => {
    const labels = byRole("image").map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Sunset over Baga beach",
        "Aguada fort walls",
        "Baga thumbnail",
        "Weekend in Goa", // ImageBlock caption stands in for alt
      ]),
    );
  });

  it("chips are buttons that announce selection", () => {
    const chips = byRole("button").filter((n) => n.props.accessibilityState?.selected !== undefined);
    expect(chips.length).toBeGreaterThanOrEqual(3);
    const selected = chips.filter((n) => n.props.accessibilityState.selected === true);
    expect(selected.length).toBe(1); // "All" starts active
  });

  it("tabs carry the tab role with exactly one selected", () => {
    const tabs = byRole("tab");
    expect(tabs.length).toBe(2);
    expect(tabs.filter((n) => n.props.accessibilityState?.selected === true).length).toBe(1);
  });

  it("actionable list rows are buttons; static rows are not", () => {
    const actionable = byRole("button").filter((n) => textOf(n).includes("Baga Beach"));
    expect(actionable.length).toBeGreaterThanOrEqual(1);
    const staticRow = tree.root.findAll(
      (n) => typeof n.type === "string" && textOf(n).includes("Storage used"),
    );
    expect(staticRow.length).toBeGreaterThanOrEqual(1);
    expect(staticRow.every((n) => n.props.accessibilityRole === undefined)).toBe(true);
  });
});
