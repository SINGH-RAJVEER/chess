package engine

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const startupBudget = 10 * time.Second

type worker struct {
	path     string
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	lines    chan string
	done     chan struct{}
	cancel   context.CancelFunc
	busy     bool
	gameID   int
	opponent string
}

var pool = struct {
	sync.Mutex
	workers  []*worker
	reserved int
}{}

// Lease reserves CPU capacity and an exclusive engine process before commit.
type Lease struct {
	worker  *worker
	options Options
	gameID  int
	once    sync.Once
}

func Acquire(ctx context.Context, options Options, gameID int) (*Lease, error) {
	selector, err := normalizeOpponent(options.Opponent)
	if err != nil {
		return nil, err
	}
	var path string
	if selector == opponentStockfish {
		path, err = stockfishPath()
	} else {
		path, err = enginePath()
	}
	if err != nil {
		return nil, err
	}
	pool.Lock()
	if pool.reserved >= searchConcurrency() {
		pool.Unlock()
		return nil, ErrBusy
	}
	pool.reserved++
	var selected *worker
	for _, candidate := range pool.workers {
		select { case <-candidate.done: continue; default: }
		if !candidate.busy && candidate.path == path {
			selected = candidate
			if gameID != 0 && candidate.gameID == gameID {
				break
			}
		}
	}
	if selected != nil {
		selected.busy = true
	}
	pool.Unlock()
	lease := &Lease{worker: selected, options: options, gameID: gameID}
	if selected == nil {
		selected, err = startWorker(ctx, path)
		if err != nil {
			lease.Release()
			return nil, err
		}
		selected.busy = true
		lease.worker = selected
		pool.Lock()
		pool.workers = append(pool.workers, selected)
		pool.Unlock()
	}
	return lease, nil
}

func startWorker(parent context.Context, path string) (*worker, error) {
	processCtx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(processCtx, path)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}
	w := &worker{path: path, cmd: cmd, stdin: stdin, lines: make(chan string, 128), done: make(chan struct{}), cancel: cancel}
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			select {
			case w.lines <- scanner.Text():
			case <-processCtx.Done():
			}
		}
		close(w.lines)
		_ = cmd.Wait()
		close(w.done)
	}()
	ctx, stop := context.WithTimeout(parent, startupBudget)
	defer stop()
	if err := w.write("uci\n"); err != nil {
		w.destroy()
		return nil, err
	}
	if err := w.until(ctx, "uciok"); err != nil {
		w.destroy()
		return nil, err
	}
	if err := w.write("setoption name Threads value 1\nsetoption name Hash value 16\nisready\n"); err != nil {
		w.destroy()
		return nil, err
	}
	if err := w.until(ctx, "readyok"); err != nil {
		w.destroy()
		return nil, err
	}
	return w, nil
}

func (w *worker) write(script string) error { _, err := io.WriteString(w.stdin, script); return err }

func (w *worker) until(ctx context.Context, prefix string) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case line, ok := <-w.lines:
			if !ok {
				return fmt.Errorf("engine exited")
			}
			if strings.HasPrefix(line, prefix) {
				return nil
			}
		}
	}
}

func (w *worker) destroy() {
	w.cancel()
	_ = w.stdin.Close()
	<-w.done
}

func (lease *Lease) Release() {
	lease.once.Do(func() {
		pool.Lock()
		defer pool.Unlock()
		pool.reserved--
		if w := lease.worker; w != nil {
			w.busy = false
			select {
			case <-w.done:
				for i, candidate := range pool.workers {
					if candidate == w {
						pool.workers = append(pool.workers[:i], pool.workers[i+1:]...)
						break
					}
				}
			default:
			}
		}
		for len(pool.workers) > searchConcurrency() {
			removed := false
			for i, w := range pool.workers {
				if !w.busy {
					w.destroy()
					pool.workers = append(pool.workers[:i], pool.workers[i+1:]...)
					removed = true
					break
				}
			}
			if !removed {
				break
			}
		}
	})
}

func (lease *Lease) Search(parent context.Context, fen string) (string, string, error) {
	if err := validateFEN(fen); err != nil {
		return "", "", err
	}
	w := lease.worker
	opponent := lease.options.Opponent
	if opponent == "" {
		opponent = "minimax"
	}
	if opponent == "dqn" {
		opponent = "custom"
	}
	ctx, cancel := context.WithTimeout(parent, time.Duration(SearchBudgetMS)*time.Millisecond+time.Second)
	defer cancel()
	if lease.gameID == 0 || w.gameID != lease.gameID || w.opponent != opponent {
		if err := w.write("ucinewgame\nisready\n"); err != nil {
			w.destroy()
			return "", "", err
		}
		if err := w.until(ctx, "readyok"); err != nil {
			w.destroy()
			return "", "", err
		}
	}
	w.gameID, w.opponent = lease.gameID, opponent
	var option string
	if opponent == "stockfish" {
		option = fmt.Sprintf("setoption name Skill Level value %d\n", stockfishSkills[NormalizeLevel(lease.options.Level)-1])
	} else {
		option = fmt.Sprintf("setoption name Opponent value %s\n", opponent)
	}
	if err := w.write(option + "position fen " + fen + fmt.Sprintf("\ngo movetime %d\n", SearchBudgetMS)); err != nil {
		w.destroy()
		return "", "", err
	}
	var info string
	invalid := false
	for {
		select {
		case <-ctx.Done():
			// Discard the worker so an old result cannot enter a later lease.
			w.destroy()
			return "", "", ctx.Err()
		case line, ok := <-w.lines:
			if !ok {
				w.destroy()
				return "", "", fmt.Errorf("engine exited without a move")
			}
			if line == "info string error invalid position" {
				invalid = true
			}
			if strings.HasPrefix(line, "info depth ") {
				info = line
			}
			if strings.HasPrefix(line, "bestmove ") {
				if invalid {
					return "", "", ErrInvalidPosition
				}
				fields := strings.Fields(line)
				if len(fields) < 2 || fields[1] == "0000" || fields[1] == "(none)" {
					return "", "", ErrNoMoves
				}
				return fields[1], "engine=" + opponent + " " + info, nil
			}
		}
	}
}

func Warm(ctx context.Context) {
	for _, opponent := range []string{"stockfish", "minimax"} {
		lease, err := Acquire(ctx, Options{Opponent: opponent}, 0)
		if err == nil {
			lease.Release()
		}
	}
}

func Close() {
	pool.Lock()
	defer pool.Unlock()
	for _, w := range pool.workers {
		w.destroy()
	}
	pool.workers = nil
}
