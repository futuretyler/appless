/** KeyGate: the API key field must be concealed with an explicit reveal. */

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
// eslint-disable-next-line import/first
import { KeyGate } from "../src/genos/shell/KeyGate";

function renderGate(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<KeyGate status="missing" />);
  });
  return tree;
}

const keyInput = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props?.onChangeText === "function")[0];

describe("KeyGate", () => {
  it("conceals the key by default with autofill disabled", () => {
    const tree = renderGate();
    const input = keyInput(tree);
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoComplete).toBe("off");
    expect(input.props.importantForAutofill).toBe("no");
    expect(input.props.textContentType).toBe("none");
    act(() => tree.unmount());
  });

  it("reveals and re-conceals via the Show/Hide toggle", () => {
    const tree = renderGate();
    const toggle = () =>
      tree.root.findAll((n) => n.props?.accessibilityRole === "button")[0];
    expect(toggle().props.accessibilityLabel).toBe("Show key");

    act(() => toggle().props.onPress());
    expect(keyInput(tree).props.secureTextEntry).toBe(false);
    expect(toggle().props.accessibilityLabel).toBe("Hide key");

    act(() => toggle().props.onPress());
    expect(keyInput(tree).props.secureTextEntry).toBe(true);
    act(() => tree.unmount());
  });
});
