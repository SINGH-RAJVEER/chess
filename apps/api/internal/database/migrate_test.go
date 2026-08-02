package database

import "testing"

func TestEmbeddedMigrationsAreOrdered(t *testing.T) {
	files, err := loadMigrations()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 migrations, got %d", len(files))
	}
	if files[0].version != 1 || files[1].version != 2 {
		t.Fatalf("unexpected migration order: %d, %d", files[0].version, files[1].version)
	}
}
