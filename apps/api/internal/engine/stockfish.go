package engine

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Stockfish runs as an external UCI binary rather than through the Rust
// library. A fresh process is spawned per move, so no strength settings or
// hash contents leak between games, matching the stateless per-call model of
// the in-process engines.

const (
	MinLevel     = 1
	MaxLevel     = 8
	DefaultLevel = 4
)

// ErrStockfishUnavailable reports that no Stockfish binary could be found at
// STOCKFISH_PATH or on PATH.
var ErrStockfishUnavailable = errors.New("stockfish is not installed on the server")

type stockfishLevel struct {
	skill      int
	depth      int
	movetimeMS int
}

// Levels lean on Skill Level plus shallow depth and short move times at the
// bottom end: UCI_Elo bottoms out at 1320, which is too strong for beginners.
var stockfishLevels = [MaxLevel]stockfishLevel{
	{skill: 0, depth: 1, movetimeMS: 50},
	{skill: 2, depth: 2, movetimeMS: 100},
	{skill: 5, depth: 3, movetimeMS: 150},
	{skill: 8, depth: 5, movetimeMS: 200},
	{skill: 11, depth: 7, movetimeMS: 300},
	{skill: 14, depth: 10, movetimeMS: 500},
	{skill: 17, depth: 14, movetimeMS: 800},
	{skill: 20, depth: 22, movetimeMS: 1500},
}

// stockfishStartupBudget covers process start and NNUE loading on top of
// the search time before the process is killed.
const stockfishStartupBudget = 10 * time.Second

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

func stockfishBestMove(fen string, level int) (string, string, error) {
	path, err := stockfishPath()
	if err != nil {
		return "", "", err
	}
	settings := stockfishLevels[level-1]
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(settings.movetimeMS)*time.Millisecond+stockfishStartupBudget)
	defer cancel()

	cmd := exec.CommandContext(ctx, path)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", "", err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", "", err
	}
	if err := cmd.Start(); err != nil {
		return "", "", fmt.Errorf("start stockfish: %w", err)
	}
	defer func() {
		_ = stdin.Close()
		_ = cmd.Wait()
	}()

	// Stockfish reads commands in order, so the whole script can be written
	// before uciok; options apply before the position is searched.
	script := fmt.Sprintf(
		"uci\nsetoption name Threads value 1\nsetoption name Hash value 16\nsetoption name Skill Level value %d\nucinewgame\nposition fen %s\ngo depth %d movetime %d\n",
		settings.skill, fen, settings.depth, settings.movetimeMS,
	)
	if _, err := stdin.Write([]byte(script)); err != nil {
		return "", "", fmt.Errorf("write stockfish: %w", err)
	}

	depth, score := "", ""
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		switch fields[0] {
		case "info":
			for i := 1; i+1 < len(fields); i++ {
				switch fields[i] {
				case "depth":
					depth = fields[i+1]
				case "score":
					if i+2 < len(fields) {
						score = fields[i+1] + " " + fields[i+2]
					}
				}
			}
		case "bestmove":
			_, _ = stdin.Write([]byte("quit\n"))
			if len(fields) < 2 || fields[1] == "(none)" {
				return "", "", ErrNoMoves
			}
			info := fmt.Sprintf("stockfish level=%d depth=%s score=%s", level, depth, score)
			return fields[1], info, nil
		}
	}
	if ctx.Err() != nil {
		return "", "", errors.New("stockfish timed out")
	}
	return "", "", errors.New("stockfish exited without a move")
}
