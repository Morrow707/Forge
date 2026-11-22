/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
// The translation of what a person typed (server/translation.ts): one model call for every text
// not seen yet, the same text asked twice translated once, English never sent, a failure never kept.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTranslationCache, translateTexts, type TranslateAsker } from "./translation";

const fakeAsker = () =>
  vi.fn<TranslateAsker>(async (texts) => texts.map((t) => `ES:${t}`));

beforeEach(() => clearTranslationCache());

describe("translating typed text", () => {
  it("asks once for the texts it has not seen, in order, and remembers them", async () => {
    const ask = fakeAsker();
    expect(await translateTexts(["Good work", "Rest Friday"], "es", ask)).toEqual(["ES:Good work", "ES:Rest Friday"]);
    expect(await translateTexts(["Rest Friday", "New one"], "es", ask)).toEqual(["ES:Rest Friday", "ES:New one"]);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toEqual(["New one"]);
  });

  it("the same text twice in one request is sent once", async () => {
    const ask = fakeAsker();
    expect(await translateTexts(["Same", "Same"], "es", ask)).toEqual(["ES:Same", "ES:Same"]);
    expect(ask.mock.calls[0][0]).toEqual(["Same"]);
  });

  it("English is never sent to the model", async () => {
    const ask = fakeAsker();
    expect(await translateTexts(["Good work"], "en", ask)).toEqual(["Good work"]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("a failed translation is null and is asked again next time, never remembered", async () => {
    const failing = vi.fn<TranslateAsker>(async () => null);
    expect(await translateTexts(["Hello"], "es", failing)).toEqual([null]);
    const ask = fakeAsker();
    expect(await translateTexts(["Hello"], "es", ask)).toEqual(["ES:Hello"]);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("blank text is returned as it is and never sent", async () => {
    const ask = fakeAsker();
    expect(await translateTexts(["  ", "Hi"], "es", ask)).toEqual(["  ", "ES:Hi"]);
    expect(ask.mock.calls[0][0]).toEqual(["Hi"]);
  });
});
