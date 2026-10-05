// Package testdb opens isolated integration-test databases and migrates
// them. Each test and process gets its own database so `go test ./...` can
// run tests and packages in parallel without sharing state. Tests skip when no
// database server is reachable, keeping the suite green without PostgreSQL.
package testdb

import (
	"context"
	"fmt"
	"hash/fnv"
	neturl "net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rajveer/sixtyfour/apps/api/internal/database"
)

var wipeTables = []string{
	"computer_game_archives",
	"moves",
	"pieces",
	"games",
	"queue",
	"session",
	"account",
	"password",
	"verification",
	`"user"`,
}

// Open connects to a unique test database, migrates it, and registers cleanup
// that wipes and drops it. TEST_DATABASE_URL or DATABASE_URL selects the
// server; the database name includes the package, process, and test name.
// It calls t.Skip when unreachable.
func Open(t *testing.T) *pgxpool.Pool {
	t.Helper()
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(t.Name()))
	name := fmt.Sprintf("sixtyfour_test_%s_%d_%x", callerPackage(), os.Getpid(), hash.Sum32())
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		url = os.Getenv("DATABASE_URL")
	}
	if url == "" {
		url = "postgres://postgres:postgres@localhost:5432/postgres"
	}
	url = withDatabase(url, name)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ensureDatabase(ctx, url)
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Skipf("no test database: %v", err)
	}
	if err := database.Migrate(ctx, pool); err != nil {
		pool.Close()
		t.Fatalf("migrate test database: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		for _, table := range wipeTables {
			if _, err := pool.Exec(ctx, "DELETE FROM "+table); err != nil {
				t.Errorf("wipe %s: %v", table, err)
			}
		}
		pool.Close()
		config, err := pgxpool.ParseConfig(url)
		if err != nil {
			return
		}
		config.ConnConfig.Database = "postgres"
		maintenance, err := pgxpool.NewWithConfig(ctx, config)
		if err != nil {
			return
		}
		defer maintenance.Close()
		_, _ = maintenance.Exec(ctx, fmt.Sprintf("DROP DATABASE %s", pgx.Identifier{name}.Sanitize()))
	})
	return pool
}

// callerPackage returns the name of the package calling Open, sanitized
// for use in a database identifier.
func callerPackage() string {
	// Skip callerPackage and Open to land on the calling test file.
	_, file, _, ok := runtime.Caller(2)
	if !ok {
		return "misc"
	}
	name := filepath.Base(filepath.Dir(file))
	var clean strings.Builder
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			clean.WriteRune(r)
		} else {
			clean.WriteRune('_')
		}
	}
	if clean.Len() == 0 {
		return "misc"
	}
	return clean.String()
}

// withDatabase returns url pointed at the given database name.
func withDatabase(url, name string) string {
	parsed, err := neturl.Parse(url)
	if err == nil && (parsed.Scheme == "postgres" || parsed.Scheme == "postgresql") {
		parsed.Path = "/" + name
		return parsed.String()
	}
	return url + " dbname=" + name
}

// ensureDatabase creates the database named by url when missing, using the
// maintenance database on the same server.
func ensureDatabase(ctx context.Context, url string) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return
	}
	name := config.ConnConfig.Database
	config.ConnConfig.Database = "postgres"
	maintenance, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return
	}
	defer maintenance.Close()
	var exists bool
	if err := maintenance.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)`, name).Scan(&exists); err != nil || exists {
		return
	}
	_, _ = maintenance.Exec(ctx, fmt.Sprintf(`CREATE DATABASE %s`, pgx.Identifier{name}.Sanitize()))
}
