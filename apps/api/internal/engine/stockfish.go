package engine

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Stockfish runs through the same persistent UCI pool as sixtyfour-engine, so
// no strength settings or hash contents leak between games.

const (
	MinLevel     = 1
	MaxLevel     = 8
	DefaultLevel = 4
)

// ErrStockfishUnavailable reports that no Stockfish binary could be found at
// STOCKFISH_PATH or on PATH.
var ErrStockfishUnavailable = errors.New("stockfish is not installed on the server")

var stockfishSkills = [MaxLevel]int{0, 2, 5, 8, 11, 14, 17, 20}

// NormalizeLevel clamps a requested Stockfish level into 1-8; zero or
// negative values select DefaultLevel.
func NormalizeLevel(level int) int {
	switch {
	case level <= 0:
		return DefaultLevel
	case level > MaxLevel:
		return MaxLevel
	default:
		return level
	}
}

// StockfishAvailable reports whether a Stockfish binary can be resolved.
func StockfishAvailable() bool {
	_, err := stockfishPath()
	return err == nil
}

func stockfishPath() (string, error) {
	name := os.Getenv("STOCKFISH_PATH")
	if name == "" {
		// Bun adds npm's Stockfish.js CLI to PATH. Native server workers
		// must resolve the installed binary rather than that browser package.
		for _, directory := range filepath.SplitList(os.Getenv("PATH")) {
			if strings.Contains("/"+filepath.ToSlash(directory)+"/", "/node_modules/") {
				continue
			}
			if path, err := exec.LookPath(filepath.Join(directory, "stockfish")); err == nil {
				return path, nil
			}
		}
		return "", ErrStockfishUnavailable
	}
	path, err := exec.LookPath(name)
	if err != nil {
		return "", ErrStockfishUnavailable
	}
	return path, nil
}
