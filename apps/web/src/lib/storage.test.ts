import { expect, test } from "bun:test";
import { migrateStorage } from "./storage";

function storedValues(values: Record<string, string>): Storage {
	const entries = new Map(Object.entries(values));
	return {
		get length() {
			return entries.size;
		},
		key: (index) => Array.from(entries.keys())[index] ?? null,
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => {
			entries.set(key, value);
		},
		removeItem: (key) => {
			entries.delete(key);
		},
		clear: () => {
			entries.clear();
		},
	};
}

test("rename keeps settings, local games and profile images", () => {
	const storage = storedValues({
		chess_settings: '{"confirmMoves":false}',
		chess_local_computer_game: '{"moves":["e4","e5"]}',
		chess_profile_image_user: "profile.png",
		unrelated: "keep",
	});
	migrateStorage(storage);
	expect(storage.getItem("sixtyfour_settings")).toBe('{"confirmMoves":false}');
	expect(storage.getItem("sixtyfour_local_computer_game")).toBe('{"moves":["e4","e5"]}');
	expect(storage.getItem("sixtyfour_profile_image_user")).toBe("profile.png");
	expect(storage.getItem("chess_settings")).toBeNull();
	expect(storage.getItem("unrelated")).toBe("keep");
});

test("rename preserves newer values and can run again without restoring old data", () => {
	const storage = storedValues({ chess_user: "old", sixtyfour_user: "current" });
	migrateStorage(storage);
	expect(storage.getItem("sixtyfour_user")).toBe("current");
	storage.removeItem("sixtyfour_user");
	migrateStorage(storage);
	expect(storage.getItem("sixtyfour_user")).toBeNull();
});
