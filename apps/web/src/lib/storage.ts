/** Move saved browser data to the current project namespace before rendering. */
export function migrateStorage(storage: Storage): void {
	try {
		const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
		for (const key of keys) {
			if (!key?.startsWith("chess_")) continue;
			const value = storage.getItem(key);
			if (value === null) continue;
			const renamed = `sixtyfour_${key.slice(6)}`;
			if (storage.getItem(renamed) === null) storage.setItem(renamed, value);
			storage.removeItem(key);
		}
	} catch {
		// Storage can be unavailable in restricted browser contexts.
	}
}
