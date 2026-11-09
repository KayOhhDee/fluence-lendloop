import { describe, expect, test } from "vitest";
import { firstFreeDay } from "../lib/format";

const range = (startDate: string, endDate: string) => ({ startDate, endDate });

describe("firstFreeDay", () => {
  test("returns the start day when nothing covers it", () => {
    expect(firstFreeDay("2030-01-10", [])).toBe("2030-01-10");
    expect(firstFreeDay("2030-01-10", [range("2030-01-11", "2030-01-12")])).toBe("2030-01-10");
    expect(firstFreeDay("2030-01-10", [range("2030-01-08", "2030-01-09")])).toBe("2030-01-10");
  });

  test("skips past a booking covering the start day", () => {
    expect(firstFreeDay("2030-01-10", [range("2030-01-09", "2030-01-12")])).toBe("2030-01-13");
  });

  test("skips back-to-back bookings, in whatever order they arrive", () => {
    const booked = [range("2030-01-13", "2030-01-14"), range("2030-01-10", "2030-01-12")];
    expect(firstFreeDay("2030-01-10", booked)).toBe("2030-01-15");
  });

  test("crosses month ends", () => {
    expect(firstFreeDay("2030-01-31", [range("2030-01-31", "2030-01-31")])).toBe("2030-02-01");
  });
});
