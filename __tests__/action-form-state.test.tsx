/**
 * Form-state trust boundary: react-lang snapshots the ENTIRE screen state
 * into every action event that doesn't name a form (any chip/list-row tap).
 * extractFormValues is the single gate that keeps that snapshot - and
 * password values even on real submits - out of the model prompt.
 */
import { Renderer } from "@openuidev/react-lang";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

// eslint-disable-next-line import/first
import { genosLibrary } from "../src/genos/library";
// eslint-disable-next-line import/first
import { extractFormValues, PASSWORD_COMPONENT_TYPE } from "../src/genos/formValues";
// eslint-disable-next-line import/first
import { textOf } from "../test-utils";

describe("extractFormValues", () => {
  const entry = (value: unknown, componentType = "Input") => ({ value, componentType });

  it("returns nothing without a formName, even when state is populated", () => {
    const state = { login: { user: entry("q") }, note: entry("draft") };
    expect(extractFormValues(undefined, state)).toBeUndefined();
  });

  it("returns nothing when the named form has no state (whole-state fallthrough)", () => {
    // react-lang sends the WHOLE state when the named form has no entries -
    // the gate must select only the named slice, never the rest.
    const state = { otherForm: { card: entry("4111") }, loose: entry("x") };
    expect(extractFormValues("login", state)).toBeUndefined();
  });

  it("unwraps the named form's entries to plain values", () => {
    const state = {
      login: { user: entry("qbert"), remember: entry(true, "Toggle") },
      otherForm: { card: entry("4111") },
    };
    expect(extractFormValues("login", state)).toEqual({ user: "qbert", remember: true });
  });

  it("strips password fields even on a real submit", () => {
    const state = {
      login: { user: entry("qbert"), secret: entry("hunter2", PASSWORD_COMPONENT_TYPE) },
    };
    expect(extractFormValues("login", state)).toEqual({ user: "qbert" });
  });

  it("returns nothing when only password fields have values", () => {
    const state = { login: { secret: entry("hunter2", PASSWORD_COMPONENT_TYPE) } };
    expect(extractFormValues("login", state)).toBeUndefined();
  });
});

const LOGIN_SCREEN = `root = Card([header, login, recover])
header = CardHeader("Sign In")
login = Form("login", btns, [userCtl, passCtl])
userCtl = FormControl("Username", user)
user = Input("username", "you@example.com", "text")
passCtl = FormControl("Password", pass)
pass = Input("secret", "Password", "password")
btns = Buttons([submit])
submit = Button("Sign In", Action([@ToAssistant("Sign in to the account")]), "primary")
recover = ListItem("Forgot password", null, "key", null, Action([@ToAssistant("Open the account recovery screen")]))`;

/** Press the innermost pressable whose subtree shows `label`. */
function press(tree: ReactTestRenderer, label: string) {
  const target = tree.root
    .findAll((n) => typeof n.props?.onPress === "function")
    .filter((n) => textOf(n).includes(label))
    .pop();
  if (!target) throw new Error(`no pressable with text "${label}"`);
  act(() => target.props.onPress());
}

describe("action events through the real renderer", () => {
  interface CapturedEvent {
    humanFriendlyMessage?: string;
    formName?: string;
    formState?: Record<string, unknown>;
  }

  function renderLogin() {
    const events: CapturedEvent[] = [];
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <Renderer
          response={LOGIN_SCREEN}
          library={genosLibrary}
          isStreaming={false}
          onAction={(ev: CapturedEvent) => events.push(ev)}
        />,
      );
    });
    // Type into both fields the way a user would.
    const inputs = tree.root.findAll((n) => typeof n.props?.onChangeText === "function");
    const username = inputs.find((n) => n.props.secureTextEntry === false);
    const password = inputs.find((n) => n.props.secureTextEntry === true);
    if (!username || !password) throw new Error("login inputs not found");
    act(() => username.props.onChangeText("qbert"));
    act(() => password.props.onChangeText("hunter2"));
    return { tree, events };
  }

  it("a non-form tap carries the leaked snapshot, and the gate refuses it", () => {
    const { tree, events } = renderLogin();
    press(tree, "Forgot password");

    expect(events).toHaveLength(1);
    const tap = events[0];
    expect(tap.formName).toBeUndefined();
    // Documents WHY the gate exists: the library really does attach the
    // whole state - including the password - to an unrelated tap.
    expect(JSON.stringify(tap.formState)).toContain("hunter2");
    // The gate keeps it out of the prompt.
    expect(extractFormValues(tap.formName, tap.formState)).toBeUndefined();
    act(() => tree.unmount());
  });

  it("a form submit forwards the named form's values minus passwords", () => {
    const { tree, events } = renderLogin();
    press(tree, "Sign In");

    expect(events).toHaveLength(1);
    const submit = events[0];
    expect(submit.formName).toBe("login");
    const values = extractFormValues(submit.formName, submit.formState);
    expect(values).toEqual({ username: "qbert" });
    expect(JSON.stringify(values)).not.toContain("hunter2");
    act(() => tree.unmount());
  });
});
