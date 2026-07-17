/** Shared test helpers (lives outside __tests__ so jest doesn't run it). */
import type { ReactTestInstance } from "react-test-renderer";

/** All text rendered inside a node's subtree, space-joined. */
export function textOf(node: ReactTestInstance): string {
  let out = "";
  const walk = (n: ReactTestInstance | string) => {
    if (typeof n === "string") {
      out += ` ${n}`;
      return;
    }
    for (const child of n.children) walk(child);
  };
  walk(node);
  return out;
}
