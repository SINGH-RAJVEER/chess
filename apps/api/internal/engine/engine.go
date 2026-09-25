// Package engine serves computer moves in-process through the Rust
// cdylib in apps/engine (see engine_best_move in apps/engine/src/lib.rs).
//
// The Go API links the static library built by `cargo build --release --lib`
// in apps/engine, so computer games no longer need a standalone engine
// server. A fresh Rust Searcher is constructed per custom-engine call, which
// keeps concurrent callers isolated; a semaphore bounds how many searches run
// at once so a burst of computer games cannot starve the HTTP server.
package engine

/*
#cgo LDFLAGS: -L${SRCDIR}/../../../engine/target/release -lchess -ldl -lm -lpthread
#include <stdlib.h>

// Mirrors apps/engine/src/lib.rs. Returns 0 on success and writes the best
// move as null-terminated UCI text into out_buf; info_buf receives optional
// diagnostic text. Negative values are ENGINE_* error codes.
int engine_best_move(const char* fen, int opponent, unsigned long long movetime_ms, int max_depth, char* out_buf, unsigned long out_len, char* info_buf, unsigned long info_len);
*/
import "C"

import (
	"errors"
	"runtime"
	"strings"
	"unsafe"
)

const (
	opponentMinimax = 0
	opponentCustom  = 1
)

const (
	maxUCIBytes  = 16
	maxInfoBytes = 256
)

var (
	// ErrBusy reports that every search slot is in use.
	ErrBusy = errors.New("engine busy")
	// ErrNoMoves reports a legal position with no legal moves.
	ErrNoMoves = errors.New("no legal moves")
	// ErrInvalidPosition reports a FEN that fails to parse or is illegal.
	ErrInvalidPosition = errors.New("invalid position")
)

var searchSlots = make(chan struct{}, searchConcurrency())

func searchConcurrency() int {
	if n := runtime.NumCPU() - 1; n > 1 {
		return n
	}
	return 1
}

// BestMove selects a computer move for fen and returns it in UCI notation
// (for example "e7e5" or "e7e8q"), plus optional diagnostic info.
//
// opponent is "minimax" or "custom"; "" defaults to minimax and legacy "dqn"
// values map to custom. Time and depth budgets come from
// ENGINE_CUSTOM_MOVETIME_MS / ENGINE_CUSTOM_MAX_DEPTH.
func BestMove(fen, opponent string) (string, string, error) {
	selector, err := normalizeOpponent(opponent)
	if err != nil {
		return "", "", err
	}
	if strings.TrimSpace(fen) == "" {
		return "", "", ErrInvalidPosition
	}
	select {
	case searchSlots <- struct{}{}:
		defer func() { <-searchSlots }()
	default:
		return "", "", ErrBusy
	}
	cFen := C.CString(fen)
	defer C.free(unsafe.Pointer(cFen))
	outBuf := C.malloc(C.size_t(maxUCIBytes))
	if outBuf == nil {
		return "", "", errors.New("engine out of memory")
	}
	defer C.free(outBuf)
	infoBuf := C.malloc(C.size_t(maxInfoBytes))
	if infoBuf == nil {
		return "", "", errors.New("engine out of memory")
	}
	defer C.free(infoBuf)
	code := C.engine_best_move(cFen, C.int(selector), 0, 0, (*C.char)(outBuf), C.ulong(maxUCIBytes), (*C.char)(infoBuf), C.ulong(maxInfoBytes))
	switch code {
	case 0:
		return C.GoString((*C.char)(outBuf)), C.GoString((*C.char)(infoBuf)), nil
	case -3:
		return "", "", ErrNoMoves
	case -2:
		return "", "", ErrInvalidPosition
	case -4:
		return "", "", errors.New("unknown opponent")
	case -99:
		return "", "", errors.New("engine panic")
	default:
		return "", "", errors.New("engine error")
	}
}

func normalizeOpponent(opponent string) (int, error) {
	switch opponent {
	case "", "minimax":
		return opponentMinimax, nil
	case "custom", "dqn":
		return opponentCustom, nil
	default:
		return 0, errors.New("opponent must be minimax or custom")
	}
}
