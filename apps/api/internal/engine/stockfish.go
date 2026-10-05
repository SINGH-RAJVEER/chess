package engine

import (
	"errors"
	"os"
	"os/exec"
)

// Stockfish runs through the same per-move UCI runner as sixtyfour-engine, so
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
		name = "stockfish"
	}
	path, err := exec.LookPath(name)
	if err != nil {
		return "", ErrStockfishUnavailable
	}
	return path, nil
}
