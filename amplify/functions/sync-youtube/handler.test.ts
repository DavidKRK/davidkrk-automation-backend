import { expect, test } from "vitest";
import { isoToSeconds } from "./handler";

test("isoToSeconds parses valid ISO 8601 durations", () => {
  expect(isoToSeconds("PT3M25S")).toBe(205);
});

test("isoToSeconds rejects zero-length durations", () => {
  expect(isoToSeconds("PT0S")).toBe(Infinity);
});

test("isoToSeconds rejects invalid durations", () => {
  expect(isoToSeconds("not-a-duration")).toBe(Infinity);
});
