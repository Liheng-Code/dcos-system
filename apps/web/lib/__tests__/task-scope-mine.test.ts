import { describe, expect, it } from "vitest";
import { isMyTask } from "../task-scope";

describe("isMyTask", () => {
  it("is true only for the task owner, not the assigner", () => {
    expect(isMyTask({ owner_id: "u1" }, "u1")).toBe(true);
    expect(isMyTask({ owner_id: "u2" }, "u1")).toBe(false);
    expect(isMyTask({ owner_id: null }, "u1")).toBe(false);
  });
});
