package config

import "testing"

func TestLoadDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/sixtyfour")
	t.Setenv("PORT", "")
	t.Setenv("HOST", "")
	t.Setenv("BETTER_AUTH_SECRET", "")
	t.Setenv("AUTH_BASE_URL", "")
	t.Setenv("WEB_ORIGIN", "")
	t.Setenv("GOOGLE_CLIENT_ID", "")
	t.Setenv("GOOGLE_CLIENT_SECRET", "")
	t.Setenv("AUTO_MIGRATE", "")

	config, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if config.Host != "0.0.0.0" || config.Port != "4000" || config.AuthBaseURL != "http://localhost:4000/api/auth" || config.WebOrigin != "http://localhost:3000" || config.GoogleClientID != "" || config.GoogleClientSecret != "" || config.AutoMigrate {
		t.Fatalf("unexpected defaults: %#v", config)
	}
}

func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected DATABASE_URL validation error")
	}
}
