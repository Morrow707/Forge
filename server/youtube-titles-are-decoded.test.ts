import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeYouTubeText } from "./youtube-catalog";

// YOUTUBE SENDS TITLES HTML-ESCAPED (2026-11-19). The exercise-video dry run showed
// "Improve Hip Health &amp; Mobility" to the admin, and an apostrophe arrives as "&#39;", which
// splits "Farmer's" into words the matcher does not know. Titles are decoded where they enter.

describe("a YouTube title", () => {
  it("is decoded to the text a person wrote", () => {
    expect(decodeYouTubeText("Improve Hip Health &amp; Mobility")).toBe("Improve Hip Health & Mobility");
    expect(decodeYouTubeText("Farmer&#39;s Carry")).toBe("Farmer's Carry");
    expect(decodeYouTubeText("Farmer&#x27;s Carry")).toBe("Farmer's Carry");
    expect(decodeYouTubeText("&quot;A Smarter Way&quot;")).toBe('"A Smarter Way"');
    expect(decodeYouTubeText("AT&T and & more")).toBe("AT&T and & more");
    expect(decodeYouTubeText("&notanentity; stays")).toBe("&notanentity; stays");
  });

  it("is decoded at every place the API hands one over", () => {
    const src = readFileSync(new URL("./youtube-catalog.ts", import.meta.url), "utf8");
    // Every snippet title, description and channel name the API returns: "item.snippet?.title".
    // https://regex101.com/?regex=snippet%5C%3F%5C.(title%7Cdescription%7CchannelTitle)
    const reads = src.match(/snippet\?\.(title|description|channelTitle)/g) ?? [];
    const decoded = src.match(/decodeYouTubeText\(item\.snippet\?\.(title|description|channelTitle)/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    expect(decoded.length).toBe(reads.length);
  });
});
