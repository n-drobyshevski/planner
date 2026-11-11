import { describe, expect, it } from "vitest";
import { ALL_STREAMS, visibleStreams } from "@/lib/mcp/app/view-model";

const streams = [
  { key: "tag:work", open: 19 },
  { key: "tag:general", open: 11 },
  { key: "none", open: 0 },
];

describe("visibleStreams", () => {
  it("shows every stream with open tasks for All, in order", () => {
    expect(visibleStreams(streams, ALL_STREAMS).map((s) => s.key)).toEqual(["tag:work", "tag:general"]);
  });

  it("shows only the chosen stream", () => {
    expect(visibleStreams(streams, "tag:general").map((s) => s.key)).toEqual(["tag:general"]);
  });

  it("falls back to the most pressing stream when the choice is gone or empty", () => {
    expect(visibleStreams(streams, null).map((s) => s.key)).toEqual(["tag:work"]);
    expect(visibleStreams(streams, "tag:gone").map((s) => s.key)).toEqual(["tag:work"]);
    expect(visibleStreams(streams, "none").map((s) => s.key)).toEqual(["tag:work"]);
  });

  it("shows nothing when nothing is open", () => {
    expect(visibleStreams([{ key: "a", open: 0 }], ALL_STREAMS)).toEqual([]);
  });
});
