import { describe, expect, test } from "bun:test";
import { cn } from "./utils";

describe("cn", () => {
	test("merges conflicting tailwind classes", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
	});

	test("drops falsy inputs", () => {
		expect(cn("text-sm", false && "hidden", undefined, "font-bold")).toBe("text-sm font-bold");
	});
});
