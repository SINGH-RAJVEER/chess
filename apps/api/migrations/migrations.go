package migrations

import "embed"

// Files contains the ordered SQL migrations applied by internal/database.
//
//go:embed *.sql
var Files embed.FS
