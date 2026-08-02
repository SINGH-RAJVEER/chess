package database

import "embed"

// migrationFiles contains the ordered SQL migrations owned by the API.
//
//go:embed migrations/*.sql
var migrationFiles embed.FS
