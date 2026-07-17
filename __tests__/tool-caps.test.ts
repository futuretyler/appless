/**
 * Tool-call fan-out caps: the model controls how many calls a round
 * contains, so the stream loop must cap executions, skip duplicates and
 * runaway queries - while still emitting one tool message per tool_call_id
 * (the protocol requires it) so the next round stays valid.
 */

const mockFetch = jest.fn();
jest.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

const mockExecuteTool = jest.fn(
  async (_name: string, args: Record<string, unknown>) => `RESULT:${args.query}`,
);
jest.mock("../src/genos/tools/search", () => ({
  toolsAvailable: () => true,
  TOOL_DEFS: [],
  TOOLS_PROMPT_SECTION: "",
  executeTool: (...args: [string, Record<string, unknown>]) => mockExecuteTool(...args),
}));

import { cerebrasKey } from "../src/config";
import { streamScreen, type ChatMessage } from "../src/genos/stream";

/** An SSE response body yielding the given data lines, then closing. */
function sseResponse(lines: string[]) {
  const chunks = lines.map((l) => new TextEncoder().encode(`data: ${l}\n`));
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined },
      }),
    },
  };
}

const toolCallChunk = (calls: Array<{ id: string; query: string }>) =>
  JSON.stringify({
    choices: [
      {
        delta: {
          tool_calls: calls.map((c, index) => ({
            index,
            id: c.id,
            function: { name: "web_search", arguments: JSON.stringify({ query: c.query }) },
          })),
        },
        finish_reason: null,
      },
    ],
  });

const finish = (reason: string) => JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] });
const contentChunk = (text: string) =>
  JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] });

beforeAll(async () => {
  await cerebrasKey.set("csk-test-key");
});

it("caps executions at 3, skips duplicates and runaway queries, and answers every call id", async () => {
  const longQuery = "x".repeat(300);
  mockFetch
    .mockResolvedValueOnce(
      sseResponse([
        toolCallChunk([
          { id: "c0", query: "weather bengaluru" },
          { id: "c1", query: "Weather Bengaluru" }, // duplicate (case-insensitive)
          { id: "c2", query: longQuery }, // runaway
          { id: "c3", query: "news today" },
          { id: "c4", query: "stock prices" },
          { id: "c5", query: "one too many" }, // over the cap
        ]),
        finish("tool_calls"),
        "[DONE]",
      ]),
    )
    .mockResolvedValueOnce(sseResponse([contentChunk("root = Card([])"), finish("stop"), "[DONE]"]));

  const done = new Promise<void>((resolve, reject) => {
    streamScreen([{ role: "user", content: "hi" }], {
      onDelta: jest.fn(),
      onDone: () => resolve(),
      onError: reject,
    });
  });
  await done;

  // Exactly 3 real executions - the cap - and never the duplicate/runaway.
  const executedQueries = mockExecuteTool.mock.calls.map(([, args]) => args.query);
  expect(executedQueries).toEqual(["weather bengaluru", "news today", "stock prices"]);

  // The second round's request must carry a tool message for EVERY call id.
  const round2Body = JSON.parse(mockFetch.mock.calls[1][1].body) as { messages: ChatMessage[] };
  const toolMessages = round2Body.messages.filter((m) => m.role === "tool");
  expect(toolMessages.map((m) => m.tool_call_id)).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);
  const byId = Object.fromEntries(toolMessages.map((m) => [m.tool_call_id, m.content]));
  expect(byId.c0).toBe("RESULT:weather bengaluru");
  expect(byId.c1).toContain("duplicate query");
  expect(byId.c2).toContain("query too long");
  expect(byId.c3).toBe("RESULT:news today");
  expect(byId.c4).toBe("RESULT:stock prices");
  expect(byId.c5).toContain("too many tool calls");
});
