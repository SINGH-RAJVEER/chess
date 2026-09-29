// API base URL resolution, kept free of native imports so it stays
// unit-testable under bun.
export function getApiBaseUrl(): string {
	const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
	if (configured) return configured.replace(/\/+$/, "");
	return "http://localhost:4000";
}

export function getApiBaseUrlForDisplay(): string {
	return getApiBaseUrl();
}
