package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/chess")
	t.Setenv("PORT", "")
	t.Setenv("HOST", "")
	t.Setenv("CHESS_ENGINE_URL", "")
	t.Setenv("BETTER_AUTH_SECRET", "")
	t.Setenv("WEB_ORIGIN", "")
	t.Setenv("AUTO_MIGRATE", "")

	config, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if config.Host != "0.0.0.0" || config.Port != "4000" || config.EngineURL != "http://127.0.0.1:8080" || config.WebOrigin != "http://localhost:3000" || config.AutoMigrate {
		t.Fatalf("unexpected defaults: %#v", config)
	}
}

func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected DATABASE_URL validation error")
	}
}
