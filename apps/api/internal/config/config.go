package config

import (
	"fmt"
	"os"
)

type Config struct {
	DatabaseURL        string
	Host               string
	Port               string
	EngineURL          string
	AuthSecret         string
	AuthBaseURL        string
	WebOrigin          string
	GoogleClientID     string
	GoogleClientSecret string
	AutoMigrate        bool
}

func Load() (Config, error) {
	config := Config{
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		Host:               valueOrDefault("HOST", "0.0.0.0"),
		Port:               valueOrDefault("PORT", "4000"),
		EngineURL:          valueOrDefault("CHESS_ENGINE_URL", "http://127.0.0.1:8080"),
		AuthSecret:         valueOrDefault("BETTER_AUTH_SECRET", "default-secret-change-me"),
		AuthBaseURL:        valueOrDefault("AUTH_BASE_URL", "http://localhost:4000/api/auth"),
		WebOrigin:          valueOrDefault("WEB_ORIGIN", "http://localhost:3000"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		AutoMigrate:        os.Getenv("AUTO_MIGRATE") == "true",
	}
	if config.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	return config, nil
}

func valueOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
