package database

import "testing"

func TestEmbeddedMigrationsAreOrdered(t *testing.T) {
	files, err := loadMigrations()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 4 {
		t.Fatalf("expected 4 migrations, got %d", len(files))
	}
	for index, migration := range files {
		if migration.version != int64(index+1) {
			t.Fatalf("migration %d has version %d", index, migration.version)
		}
	}
}
