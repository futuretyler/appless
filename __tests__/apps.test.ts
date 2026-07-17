/**
 * Summoned-app identity: free-form commands become apps whose id derives
 * from the FULL text. Truncating before slugging collapsed distinct long
 * requests into one app and silently resumed the old session.
 */
import { summonApp, summonAppForCommand } from "../src/genos/apps";

describe("summonAppForCommand", () => {
  it("keeps long commands sharing a 24-char prefix as distinct apps", () => {
    const april = summonAppForCommand("plan my trip to japan in april");
    const december = summonAppForCommand("plan my trip to japan in december");
    expect(april.id).not.toBe(december.id);
  });

  it("is stable: the same command maps to the same app", () => {
    expect(summonAppForCommand("track my reading list").id).toBe(
      summonAppForCommand("track my reading list").id,
    );
  });

  it("truncates only the display name, and embeds the full text in the request", () => {
    const text = "plan my trip to japan in april";
    const app = summonAppForCommand(text);
    expect(app.name).toBe("plan my trip to japan in…");
    expect(app.name.length).toBeLessThanOrEqual(25);
    expect(app.request).toContain(`"${text}"`);
  });

  it("leaves short commands untouched", () => {
    const app = summonAppForCommand("chess");
    expect(app.name).toBe("chess");
    expect(app.id).toBe(summonApp("chess").id);
  });
});
