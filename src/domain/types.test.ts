import { describe, expect, it } from "vitest";
import { fileSize, nextNoteTitle, stem, validUrl, type Note } from "./types";
describe("metadata input conventions", () => {
  it("keeps HTTP(S) URLs complete", () => {
    for (const s of [
      "example.org",
      "doi:10/x",
      "https:example.org",
      "file:///x",
    ])
      expect(validUrl(s)).toBe(false);
    expect(validUrl("https://doi.org/10/x")).toBe(true);
    expect(validUrl("")).toBe(true);
  });
  it("removes only the final suffix", () => {
    expect(stem("folder/paper.v2.pdf")).toBe("paper.v2");
    expect(stem(".hidden")).toBe(".hidden");
  });
  it("chooses the first unused readable title within a source", () => {
    expect(
      nextNoteTitle([
        { title: "Reading note 1" },
        { title: "Reading note 3" },
      ] as Note[]),
    ).toBe("Reading note 2");
  });
});

it("formats byte sizes using decimal units and distinguishes unknown from empty", () => {
  expect(fileSize(null)).toBe("Unknown");
  expect(fileSize(0)).toBe("0 B");
  expect(fileSize(999)).toBe("999 B");
  expect(fileSize(1000)).toBe("1 KB");
  expect(fileSize(1536000)).toBe("1.54 MB");
  expect(fileSize(1000000000)).toBe("1 GB");
});
