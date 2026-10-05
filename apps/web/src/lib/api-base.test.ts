import { describe, expect, test } from "bun:test";
import { resolveApiBaseUrl, resolveWsUrl } from "./api-base";

describe("resolveApiBaseUrl", () => {
	test("browser defaults to same-origin", () => {
		expect(resolveApiBaseUrl({}, false)).toBe("");
	});

	test("explicit base wins in both runtimes", () => {
		expect(resolveApiBaseUrl({ VITE_API_BASE_URL: "https://api.example.com/" }, false)).toBe(
			"https://api.example.com",
		);
		expect(resolveApiBaseUrl({ VITE_API_BASE_URL: "https://api.example.com/" }, true)).toBe(
			"https://api.example.com",
		);
	});

	test("desktop shell defaults to the local API", () => {
		expect(resolveApiBaseUrl({}, true)).toBe("http://127.0.0.1:4000");
	});

	test("desktop override is honored and trimmed", () => {
		expect(
			resolveApiBaseUrl({ VITE_DESKTOP_API_URL: "http://192.168.1.5:4000///" }, true),
		).toBe("http://192.168.1.5:4000");
	});

	test("desktop override does not leak into the browser", () => {
		expect(resolveApiBaseUrl({ VITE_DESKTOP_API_URL: "http://192.168.1.5:4000" }, false)).toBe(
			"",
		);
	});
});

describe("resolveWsUrl", () => {
	test("derives the socket URL from the API base", () => {
		expect(resolveWsUrl("http://127.0.0.1:4000", "https:", "sixtyfour")).toBe(
			"ws://127.0.0.1:4000/api/ws",
		);
		expect(resolveWsUrl("https://api.example.com", "https:", "example.com")).toBe(
			"wss://api.example.com/api/ws",
		);
	});

	test("falls back to same-origin", () => {
		expect(resolveWsUrl("", "https:", "example.com")).toBe("wss://example.com/api/ws");
		expect(resolveWsUrl("", "http:", "localhost:3000")).toBe("ws://localhost:3000/api/ws");
	});
});
