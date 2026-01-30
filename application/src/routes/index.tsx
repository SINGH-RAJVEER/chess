import { createSignal, For, Show, createMemo, createEffect } from "solid-js";
import { createFileRoute } from "@tanstack/solid-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query";
import {
  getBoard,
  getMoves,
  makeMove,
  resetGame,
  undoMove,
} from "../lib/index";
import type { Color, PieceType } from "../lib/index";
import Header from "../components/header";

const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  White: {
    Pawn: "♙",
    Knight: "♘",
    Bishop: "♗",
    Rook: "♖",
    Queen: "♕",
    King: "♔",
  },
  Black: {
    Pawn: "♟",
    Knight: "♞",
    Bishop: "♝",
    Rook: "♜",
    Queen: "♛",
    King: "♚",
  },
};

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const queryClient = useQueryClient();
  const [rotation, setRotation] = createSignal(0);

  const storedMoves = () => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("chess_pending_move");
        return stored ? JSON.parse(stored) : null;
      } catch (e) {
        console.error("Failed to parse pending move", e);
      }
    }
    return null;
  };

  // Initialize pendingMove from localStorage if available
  const [pendingMove, setPendingMove] = createSignal<{
    from: number;
    to: number;
  } | null>(storedMoves());

  // Persist pendingMove to localStorage
  createEffect(() => {
    if (typeof window !== "undefined") {
      const move = pendingMove();
      if (move) {
        localStorage.setItem("chess_pending_move", JSON.stringify(move));
      } else {
        localStorage.removeItem("chess_pending_move");
      }
    }
  });

  const boardQuery = useQuery(() => ({
    queryKey: ["board"],
    queryFn: async () => {
      try {
        return await getBoard();
      } catch (e) {
        console.error("✗ Failed to fetch board:", e);
        throw e;
      }
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  }));

  const moveMutation = useMutation(() => ({
    mutationFn: (args: { data: { from: number; to: number } }) =>
      makeMove(args),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      setPendingMove(null);
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === "object" && "message" in e
          ? (e as any).message
          : String(e);
      setErrorMsg(`Move failed: ${msg}`);
      setTimeout(() => setErrorMsg(null), 3000);
      // Keep pending move so user can retry or cancel
    },
  }));

  const undoMutation = useMutation(() => ({
    mutationFn: () => undoMove(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board"] });

      setTimeout(() => setSuccessMsg(null), 2000);
    },

    onError: (e: any) => {
      setErrorMsg(`Undo failed: ${e.message}`);

      setTimeout(() => setErrorMsg(null), 3000);
    },
  }));

  const resetMutation = useMutation(() => ({
    mutationFn: (opts?: {
      mode: "vs_player" | "vs_computer";
      timeControl: number;
    }) => resetGame({ data: opts }),
    onSuccess: async () => {
      await boardQuery.refetch();
      setSelectedSquare(null);
      setValidMoves([]);
      setPendingMove(null);
      setErrorMsg(null);
    },
    onError: (e: any) => {
      setErrorMsg(
        `Failed to reset game: ${e instanceof Error ? e.message : String(e)}`,
      );
    },
  }));

  // Timer Logic
  const [now, setNow] = createSignal(Date.now());

  createEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => clearInterval(interval);
  });

  const formatTime = (ms: number) => {
    if (boardQuery.data?.timeControl === 0) return "∞";
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const whiteTime = createMemo(() => {
    if (!boardQuery.data) return 0;
    const { turn, status, whiteTimeRemaining, lastMoveTime, timeControl } =
      boardQuery.data;
    if (timeControl === 0) return Number.MAX_SAFE_INTEGER;
    if (turn === "White" && status === "Ongoing" && lastMoveTime) {
      const elapsed = now() - lastMoveTime;
      return Math.max(0, whiteTimeRemaining - elapsed);
    }
    return whiteTimeRemaining;
  });

  const blackTime = createMemo(() => {
    if (!boardQuery.data) return 0;
    const { turn, status, blackTimeRemaining, lastMoveTime, timeControl } =
      boardQuery.data;
    if (timeControl === 0) return Number.MAX_SAFE_INTEGER;
    if (turn === "Black" && status === "Ongoing" && lastMoveTime) {
      const elapsed = now() - lastMoveTime;
      return Math.max(0, blackTimeRemaining - elapsed);
    }
    return blackTimeRemaining;
  });

  // Derived pieces with pending move applied

  const pieces = createMemo(() => {
    const basePieces = boardQuery.data?.pieces || [];

    const pending = pendingMove();

    if (!pending) return basePieces;

    // Simulate the move locally for display

    return basePieces

      .filter((p) => p.square !== pending.to) // Remove captured piece

      .map((p) => {
        if (p.square === pending.from) {
          return { ...p, square: pending.to };
        }

        return p;
      });
  });

  const turn = createMemo(() => boardQuery.data?.turn || "White");

  // Rotation logic - depends on server turn (rotates after submit)

  createEffect(() => {
    if (turn() === "Black") {
      setRotation(180);
    } else {
      setRotation(0);
    }
  });

  const [selectedSquare, setSelectedSquare] = createSignal<number | null>(null);
  const [validMoves, setValidMoves] = createSignal<number[]>([]);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [successMsg, setSuccessMsg] = createSignal<string | null>(null);

  const getPieceAt = (squareIndex: number) => {
    return pieces().find((p) => p.square === squareIndex);
  };

  const handleSquareClick = async (squareIndex: number) => {
    if (!boardQuery.data) return;

    if (boardQuery.data.status !== "Ongoing") return;

    // If there is a pending move, interactions are limited to:

    // 1. Clicking "Confirm" (handled by button)

    // 2. Clicking "Cancel" (handled by button)

    // 3. Changing selection? Let's say we allow changing the move if they click original piece?

    // For simplicity, if pending move exists, block board clicks or treat as cancel?

    // The prompt says "player makes a move and then has to press submit".

    // Usually visual feedback implies the piece moved.

    if (pendingMove()) {
      // Optional: Allow clicking the board to cancel?

      // For now, let's enforce using the Cancel button to avoid confusion.

      return;
    }

    const currentPieces = pieces(); // This uses the memo, but since pending is null, it's base pieces

    const clickedPiece = currentPieces.find((p) => p.square === squareIndex);

    const selected = selectedSquare();

    // Case 1: Select a piece

    if (clickedPiece && clickedPiece.color === boardQuery.data.turn) {
      if (selected === squareIndex) {
        setSelectedSquare(null);

        setValidMoves([]);

        return;
      }

      setSelectedSquare(squareIndex);

      setErrorMsg(null);

      try {
        const moves = await getMoves({ data: squareIndex });

        setValidMoves(Array.isArray(moves) ? moves : []);
      } catch (e: any) {
        console.error("✗ Failed to fetch moves:", e);

        setErrorMsg(`API Error: ${e?.message || "Unknown error"}`);

        setValidMoves([]);
      }

      return;
    }

    // Case 2: Move

    if (selected !== null) {
      if (validMoves().includes(squareIndex)) {
        // Set Pending Move instead of mutating immediately

        setPendingMove({ from: selected, to: squareIndex });

        setSelectedSquare(null);

        setValidMoves([]);
      } else {
        setSelectedSquare(null);

        setValidMoves([]);
      }
    }
  };

  const handleConfirmMove = () => {
    const pending = pendingMove();

    if (pending) {
      moveMutation.mutate({ data: pending });
    }
  };

  const handleCancelMove = () => {
    setPendingMove(null);
  };

  const handleReset = (opts?: {
    mode: "vs_player" | "vs_computer";
    timeControl: number;
  }) => {
    resetMutation.mutate(opts || { mode: "vs_player", timeControl: 10 });
  };

  return (
    <div class="min-h-screen bg-gradient-to-br from-stone-900 via-stone-900 to-black font-sans text-stone-200 flex flex-col">
      <Header
        onRestart={handleReset}
        isRestarting={resetMutation.isPending}
        activeMode="vs_player"
        currentTimeControl={boardQuery.data?.timeControl}
      />

      {/* Main Game Area */}
      <div class="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 overflow-hidden relative">
        <div class="flex flex-col xl:flex-row items-center justify-center gap-8 w-full max-w-[1800px]">
          {/* Left Panel: Black Player */}
          <div class="flex flex-col gap-6 w-full max-w-[300px] xl:h-[800px] xl:justify-center order-2 xl:order-1">
            <div class="bg-stone-800 p-6 rounded-2xl shadow-xl border border-stone-700 flex flex-col gap-4 items-center text-center relative overflow-hidden">
              <div class="w-20 h-20 bg-black rounded-2xl shadow-inner flex items-center justify-center text-stone-200 font-bold border-4 border-stone-700 text-3xl mb-2">
                B
              </div>
              <div>
                <div class="font-extrabold text-2xl leading-tight text-stone-100">
                  Black
                </div>
                <div
                  class={`text-xs font-bold uppercase tracking-wider ${turn() === "Black" ? "text-emerald-400" : "text-stone-500"}`}
                >
                  {turn() === "Black" ? "Your Turn" : "Waiting"}
                </div>
                <div
                  class={`text-4xl font-mono font-bold mt-2 ${turn() === "Black" ? "text-white" : "text-stone-600"}`}
                >
                  {formatTime(blackTime())}
                </div>
              </div>

              {/* Captured Pieces (White pieces captured by Black) */}
              <div class="flex flex-wrap justify-center gap-1 min-h-[40px] w-full bg-stone-900/50 rounded-lg p-2 border border-stone-700">
                <For each={boardQuery.data?.capturedPieces?.white}>
                  {(p) => (
                    <span
                      class="text-3xl filter drop-shadow-sm text-stone-400 hover:scale-125 transition-transform cursor-help"
                      title={`Captured ${p}`}
                    >
                      {PIECE_SYMBOLS.White[p]}
                    </span>
                  )}
                </For>
                <Show when={!boardQuery.data?.capturedPieces?.white?.length}>
                  <span class="text-xs text-stone-600 italic self-center">
                    No captures
                  </span>
                </Show>
              </div>

              {/* Controls for this side (Takeback / Submit) */}
              <Show
                when={
                  (turn() === "White" &&
                    (boardQuery.data?.moves?.length || 0) > 0) ||
                  (turn() === "Black" && pendingMove())
                }
              >
                <Show when={turn() === "White"}>
                  <button
                    onClick={() => undoMutation.mutate()}
                    disabled={
                      undoMutation.isPending ||
                      (boardQuery.data?.moves?.length || 0) === 0
                    }
                    class="w-full mt-4 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-black/20 transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-2"
                  >
                    <span>↺</span> Takeback
                  </button>
                </Show>

                <Show when={turn() === "Black" && pendingMove()}>
                  <div class="flex gap-2 w-full mt-4">
                    <button
                      onClick={handleConfirmMove}
                      disabled={moveMutation.isPending}
                      class="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-bold py-3 px-2 rounded-xl shadow-lg transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-1"
                    >
                      <Show
                        when={moveMutation.isPending}
                        fallback={<span>✓ Submit</span>}
                      >
                        <span>...</span>
                      </Show>
                    </button>
                    <button
                      onClick={handleCancelMove}
                      disabled={moveMutation.isPending}
                      class="flex-1 bg-stone-600 hover:bg-stone-500 disabled:opacity-50 text-white font-bold py-3 px-2 rounded-xl shadow-lg transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-1"
                    >
                      <span>✕</span> Cancel
                    </button>
                  </div>
                </Show>
              </Show>
            </div>
          </div>

          {/* Center: Board */}
          <div class="relative group order-1 xl:order-2">
            {/* Status Messages */}
            <div class="absolute -top-16 left-0 w-full flex justify-center h-12 pointer-events-none z-30">
              <Show when={errorMsg()}>
                <div class="bg-red-600 text-white px-8 py-3 rounded-full shadow-2xl text-base font-bold animate-bounce flex items-center gap-2 border-4 border-stone-900">
                  <span>⚠️</span> {errorMsg()}
                </div>
              </Show>
              <Show when={successMsg()}>
                <div class="bg-emerald-600 text-white px-8 py-3 rounded-full shadow-2xl text-base font-bold flex items-center gap-2 border-4 border-stone-900">
                  <span>✨</span> {successMsg()}
                </div>
              </Show>
            </div>

            <div class="w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-stone-700 rounded-xl shadow-2xl overflow-hidden border-[16px] border-stone-950 relative select-none">
              <div
                class="grid grid-cols-8 grid-rows-[repeat(8,1fr)] w-full h-full transition-transform duration-1000 cubic-bezier(0.4, 0, 0.2, 1)"
                style={{ transform: `rotate(${rotation()}deg)` }}
              >
                <For each={Array.from({ length: 64 })}>
                  {(_, index) => {
                    const squareIndex = index();
                    const row = Math.floor(squareIndex / 8);
                    const col = squareIndex % 8;
                    const isBlack = (row + col) % 2 === 1;

                    const lightSquareColor = "bg-[#f0d9b5]";
                    const darkSquareColor = "bg-[#b58863]";

                    // Highlight Logic - Reactive
                    const isLastMove = () => {
                      const lastMove = boardQuery.data?.lastMove;
                      return (
                        lastMove &&
                        (lastMove.from === squareIndex ||
                          lastMove.to === squareIndex)
                      );
                    };

                    return (
                      <button
                        class={`relative w-full h-full flex items-center justify-center focus:outline-none transition-colors duration-200 ${isBlack ? darkSquareColor : lightSquareColor}`}
                        classList={{
                          "ring-inset ring-[6px] ring-indigo-500/60 z-10":
                            selectedSquare() === squareIndex,
                          "hover:brightness-105":
                            !selectedSquare() ||
                            selectedSquare() !== squareIndex,
                        }}
                        onClick={() => handleSquareClick(squareIndex)}
                      >
                        {/* Rank/File Labels */}
                        <Show when={col === 0}>
                          <span
                            class={`absolute left-1 top-1 text-[10px] sm:text-xs font-black ${isBlack ? "text-[#f0d9b5]" : "text-[#b58863]"} opacity-60`}
                            style={{
                              transform: `rotate(${rotation() === 180 ? 180 : 0}deg)`,
                            }}
                          >
                            {8 - row}
                          </span>
                        </Show>
                        <Show when={row === 7}>
                          <span
                            class={`absolute right-1 bottom-0.5 text-[10px] sm:text-xs font-black ${isBlack ? "text-[#f0d9b5]" : "text-[#b58863]"} opacity-60`}
                            style={{
                              transform: `rotate(${rotation() === 180 ? 180 : 0}deg)`,
                            }}
                          >
                            {String.fromCharCode(97 + col)}
                          </span>
                        </Show>

                        {/* Last Move Highlight */}
                        <Show when={isLastMove()}>
                          <div class="absolute inset-0 bg-yellow-500/60 pointer-events-none mix-blend-hard-light" />
                        </Show>

                        {/* Valid Move Indicator */}
                        <Show when={validMoves().includes(squareIndex)}>
                          {(() => {
                            const hasPiece = !!getPieceAt(squareIndex);
                            return hasPiece ? (
                              <div class="absolute inset-0 border-[6px] sm:border-[8px] border-rose-500/50 rounded-full m-1 sm:m-2 pointer-events-none animate-pulse" />
                            ) : (
                              <div class="w-4 h-4 sm:w-6 sm:h-6 bg-stone-900/40 rounded-full pointer-events-none" />
                            );
                          })()}
                        </Show>

                        {/* Piece */}
                        {(() => {
                          const piece = getPieceAt(squareIndex);
                          return (
                            <Show when={piece}>
                              <span
                                class="text-4xl sm:text-5xl md:text-7xl drop-shadow-2xl transition-all duration-700 ease-in-out cursor-pointer hover:scale-110 active:scale-90 transform-gpu z-20"
                                style={{
                                  transform: `rotate(${rotation() === 180 ? 180 : 0}deg)`,
                                  color:
                                    piece!.color === "White"
                                      ? "#ffffff"
                                      : "#1a1a1a",
                                  "text-shadow":
                                    piece!.color === "White"
                                      ? "0 2px 4px rgba(0,0,0,0.4)"
                                      : "0 2px 4px rgba(255,255,255,0.1)",
                                }}
                              >
                                {PIECE_SYMBOLS[piece!.color][piece!.piece_type]}
                              </span>
                            </Show>
                          );
                        })()}
                      </button>
                    );
                  }}
                </For>
              </div>

              <Show
                when={
                  boardQuery.data?.status &&
                  boardQuery.data?.status !== "Ongoing"
                }
              >
                <div class="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-50 backdrop-blur-md">
                  <div class="bg-stone-800 p-12 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.5)] text-center border-b-8 border-indigo-600 animate-in fade-in zoom-in duration-500">
                    <h2 class="text-6xl font-black text-stone-100 mb-4 tracking-tighter">
                      {boardQuery.data?.status === "Timeout"
                        ? "Time Out!"
                        : boardQuery.data?.status}
                    </h2>
                    <p class="text-2xl font-bold text-indigo-400 mb-10 tracking-wide uppercase">
                      {(() => {
                        const status = boardQuery.data?.status;
                        const turn = boardQuery.data?.turn;
                        if (status === "Stalemate") return "Draw";

                        // If Checkmate or Timeout, the player whose turn it is LOST.
                        const winner = turn === "White" ? "Black" : "White";
                        if (status === "Timeout")
                          return `${winner} Wins by Time`;
                        return `${winner} Wins`;
                      })()}
                    </p>
                    <button
                      onClick={() => handleReset()}
                      class="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xl shadow-2xl transition-all transform hover:-translate-y-2 active:translate-y-0"
                    >
                      New Challenge
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          </div>

          {/* Right Panel: White Player */}
          <div class="flex flex-col gap-6 w-full max-w-[300px] xl:h-[800px] xl:justify-center order-3">
            <div class="bg-stone-800 p-6 rounded-2xl shadow-xl border border-stone-700 flex flex-col gap-4 items-center text-center relative overflow-hidden">
              <div class="w-20 h-20 bg-stone-200 border-4 border-stone-500 rounded-2xl shadow-md flex items-center justify-center text-stone-900 font-bold text-3xl mb-2">
                W
              </div>
              <div>
                <div class="font-extrabold text-2xl leading-tight text-stone-100">
                  White
                </div>
                <div
                  class={`text-xs font-bold uppercase tracking-wider ${turn() === "White" ? "text-emerald-400" : "text-stone-500"}`}
                >
                  {turn() === "White" ? "Your Turn" : "Waiting"}
                </div>
                <div
                  class={`text-4xl font-mono font-bold mt-2 ${turn() === "White" ? "text-white" : "text-stone-600"}`}
                >
                  {formatTime(whiteTime())}
                </div>
              </div>

              {/* Captured Pieces (Black pieces captured by White) */}
              <div class="flex flex-wrap justify-center gap-1 min-h-[40px] w-full bg-stone-900/50 rounded-lg p-2 border border-stone-700">
                <For each={boardQuery.data?.capturedPieces?.black}>
                  {(p) => (
                    <span
                      class="text-3xl filter drop-shadow-sm text-stone-400 hover:scale-125 transition-transform cursor-help"
                      title={`Captured ${p}`}
                    >
                      {PIECE_SYMBOLS.Black[p]}
                    </span>
                  )}
                </For>
                <Show when={!boardQuery.data?.capturedPieces?.black?.length}>
                  <span class="text-xs text-stone-600 italic self-center">
                    No captures
                  </span>
                </Show>
              </div>

              {/* Controls for this side (Takeback / Submit) */}
              <Show
                when={
                  turn() === "Black" || (turn() === "White" && pendingMove())
                }
              >
                <Show when={turn() === "Black"}>
                  <button
                    onClick={() => undoMutation.mutate()}
                    disabled={
                      undoMutation.isPending ||
                      (boardQuery.data?.moves?.length || 0) === 0
                    }
                    class="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-black/20 transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-2"
                  >
                    <span>↺</span> Takeback
                  </button>
                </Show>

                <Show when={turn() === "White" && pendingMove()}>
                  <div class="flex gap-2 w-full mt-4">
                    <button
                      onClick={handleConfirmMove}
                      disabled={moveMutation.isPending}
                      class="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-bold py-3 px-2 rounded-xl shadow-lg transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-1"
                    >
                      <Show
                        when={moveMutation.isPending}
                        fallback={<span>✓ Submit</span>}
                      >
                        <span>...</span>
                      </Show>
                    </button>
                    <button
                      onClick={handleCancelMove}
                      disabled={moveMutation.isPending}
                      class="flex-1 bg-stone-600 hover:bg-stone-500 disabled:opacity-50 text-white font-bold py-3 px-2 rounded-xl shadow-lg transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-1"
                    >
                      <span>✕</span> Cancel
                    </button>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Move History */}
      <div class="bg-stone-900 border-t border-stone-800 p-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.5)] z-40">
        <div class="max-w-[1800px] mx-auto flex items-center gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-stone-900 px-4 pb-2">
          <div class="text-xs font-black text-stone-500 uppercase tracking-widest px-3 py-1 bg-stone-800 rounded-md shrink-0">
            History
          </div>
          <div class="flex items-center gap-6 px-2 min-w-max">
            <For
              each={Array.from({
                length: Math.ceil((boardQuery.data?.moves?.length || 0) / 2),
              })}
            >
              {(_, i) => {
                const index = i();
                const moveIndex = index * 2;
                const whiteMove = boardQuery.data?.moves?.[moveIndex];
                const blackMove = boardQuery.data?.moves?.[moveIndex + 1];
                return (
                  <div class="flex items-center text-sm font-mono">
                    <span class="text-stone-600 mr-2 select-none group-hover:text-stone-500 transition-colors">
                      {index + 1}.
                    </span>
                    <span class="font-bold text-stone-300 px-2 py-0.5 rounded hover:bg-stone-800 transition-colors cursor-pointer">
                      {whiteMove?.notation}
                    </span>
                    <Show when={blackMove}>
                      <span class="font-bold text-stone-300 px-2 py-0.5 rounded hover:bg-stone-800 transition-colors cursor-pointer ml-1">
                        {blackMove?.notation}
                      </span>
                    </Show>
                  </div>
                );
              }}
            </For>
            <Show when={boardQuery.data?.moves?.length === 0}>
              <span class="text-stone-600 text-sm italic">
                Waiting for start...
              </span>
            </Show>
            <div id="move-anchor" class="w-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
