import { afterEach, describe, expect, test } from "bun:test";
import { getApiBaseUrl, getApiBaseUrlForDisplay } from "./config";

afterEach(() => {
	delete process.env.EXPO_PUBLIC_API_URL;
});

describe("getApiBaseUrl", () => {
	test("defaults to the local API", () => {
		expect(getApiBaseUrl()).toBe("http://localhost:4000");
		expect(getApiBaseUrlForDisplay()).toBe("http://localhost:4000");
	});

	test("honors the configured URL and strips trailing slashes", () => {
		process.env.EXPO_PUBLIC_API_URL = "http://192.168.1.20:4000///";
		expect(getApiBaseUrl()).toBe("http://192.168.1.20:4000");
	});

	test("blank configuration falls back to the default", () => {
		process.env.EXPO_PUBLIC_API_URL = "   ";
		expect(getApiBaseUrl()).toBe("http://localhost:4000");
	});
});
