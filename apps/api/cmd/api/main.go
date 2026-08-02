package main

import (
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/rajveer/chess/apps/api/internal/auth"
	"github.com/rajveer/chess/apps/api/internal/config"
	"github.com/rajveer/chess/apps/api/internal/database"
	"github.com/rajveer/chess/apps/api/internal/game"
	"github.com/rajveer/chess/apps/api/internal/httpapi"
)

func main() {
	migrateOnly := flag.Bool("migrate", false, "apply migrations and exit")
	flag.Parse()
	config, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	ctx := context.Background()
	db, err := database.Open(ctx, config.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if *migrateOnly || config.AutoMigrate {
		if err := database.Migrate(ctx, db); err != nil {
			log.Fatal(err)
		}
	}
	if *migrateOnly {
		return
	}
	authService := auth.NewService(db, config.AuthSecret)
	gameService := game.NewService(db, config.EngineURL)
	server := &http.Server{
		Addr:              net.JoinHostPort(config.Host, config.Port),
		Handler:           httpapi.NewHandler(authService, gameService, httpapi.WithCORSOrigin(config.WebOrigin)),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("api listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}
