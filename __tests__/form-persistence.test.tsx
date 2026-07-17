/**
 * Form-state persistence seam: GenOS survives navigation by capturing
 * onStateUpdate and re-seeding initialState on remount - this drives that
 * exact contract through the real renderer.
 */
import { Renderer } from "@openuidev/react-lang";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

// eslint-disable-next-line import/first
import { genosLibrary } from "../src/genos/library";

const NOTE_SCREEN = `root = Card([header, compose])
header = CardHeader("New note")
compose = Form("note", btns, [titleCtl])
titleCtl = FormControl("Title", titleInput)
titleInput = Input("title", "Note title…")
btns = Buttons([save])
save = Button("Save", Action([@ToAssistant("Save the note")]), "primary")`;

function render(initialState?: Record<string, unknown>, onStateUpdate?: (s: Record<string, unknown>) => void) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <Renderer
        response={NOTE_SCREEN}
        library={genosLibrary}
        isStreaming={false}
        initialState={initialState}
        onStateUpdate={onStateUpdate}
      />,
    );
  });
  return tree;
}

const input = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props?.onEndEditing === "function")[0];

it("typed values survive an unmount/remount round trip via onStateUpdate → initialState", () => {
  let saved: Record<string, unknown> | undefined;
  const tree = render(undefined, (state) => {
    saved = state;
  });

  // User types, then the field commits on blur (endEditing → persist).
  act(() => input(tree).props.onChangeText("Groceries for Saturday"));
  act(() =>
    input(tree).props.onEndEditing({ nativeEvent: { text: "Groceries for Saturday" } }),
  );
  expect(saved).toBeDefined();
  act(() => tree.unmount());

  // Navigation remounts the screen - the saved snapshot re-seeds the form.
  const revisit = render(saved);
  expect(input(revisit).props.value).toBe("Groceries for Saturday");
  act(() => revisit.unmount());
});
