import { createSignal, For, Show, createMemo } from "solid-js";
import { createFileRoute } from "@tanstack/solid-router";
import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/solid-query";
import { getBoard, getMoves, makeMove, resetGame } from "../lib/api";
import type { Color, PieceType } from "../lib/api";

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

  const boardQuery = createQuery(() => ({
    queryKey: ["board"],
    queryFn: async () => {
      try {
        const result = await getBoard();
        return result;
      } catch (e) {
        console.error("✗ Failed to fetch board:", e);
        throw e;
      }
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  }));

  const moveMutation = createMutation(() => ({
    mutationFn: (args: { data: { from: number; to: number } }) =>
      makeMove(args),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      setSuccessMsg("Move successful!");
      setTimeout(() => setSuccessMsg(null), 2000);
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === "object" && "message" in e
          ? (e as any).message
          : String(e);
      setErrorMsg(`Move failed: ${msg}`);
    },
  }));

  const resetMutation = createMutation(() => ({
    mutationFn: () => resetGame(),
    onSuccess: async () => {
      await boardQuery.refetch();
      setSelectedSquare(null);
      setValidMoves([]);
      setErrorMsg(null);
    },
    onError: (e: any) => {
      setErrorMsg(
        `Failed to reset game: ${e instanceof Error ? e.message : String(e)}`,
      );
    },
  }));

  const pieces = createMemo(() => boardQuery.data?.pieces || []);

  const [selectedSquare, setSelectedSquare] = createSignal<number | null>(null);
  const [validMoves, setValidMoves] = createSignal<number[]>([]);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [successMsg, setSuccessMsg] = createSignal<string | null>(null);

  const getPieceAt = (squareIndex: number) => {
    return pieces().find((p) => p.square === squareIndex);
  };

  const handleSquareClick = async (squareIndex: number | undefined) => {
    if (
      typeof squareIndex !== "number" ||
      isNaN(squareIndex) ||
      squareIndex < 0 ||
      squareIndex > 63
    ) {
      setErrorMsg("Invalid square selected.");
      return;
    }

    if (!boardQuery.data) {
      return;
    }

    const currentPieces = pieces();
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
        if (
          typeof squareIndex === "number" &&
          !isNaN(squareIndex) &&
          squareIndex >= 0 &&
          squareIndex <= 63
        ) {
          // call getMoves with correct input shape
          const moves = await getMoves({ data: squareIndex });
          setValidMoves(Array.isArray(moves) ? moves : []);
        } else {
          setValidMoves([]);
        }
      } catch (e: any) {
        console.error("✗ Failed to fetch moves:", e);
        setErrorMsg(`API Error: ${e?.message || "Unknown error"}`);
        setValidMoves([]);
      }
      return;
    } else if (clickedPiece) {
      setErrorMsg("Not your turn!");
    }

    // Case 2: Move
    if (selected !== null) {
      if (
        validMoves().includes(squareIndex) &&
        typeof selected === "number" &&
        !isNaN(selected) &&
        typeof squareIndex === "number" &&
        !isNaN(squareIndex)
      ) {
        moveMutation.mutate({ data: { from: selected, to: squareIndex } });
        setSelectedSquare(null);
        setValidMoves([]);
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    }
  };

  const handleReset = () => {
    resetMutation.mutate();
  };

  const CapturedPieces = () => {
    const captured = createMemo(
      () => boardQuery.data?.capturedPieces || { white: [], black: [] },
    );

    return (
      <div class="flex justify-between max-w-[800px] mx-auto mb-4">
        <div class="flex items-center space-x-2">
          <span class="font-bold">Black captured:</span>
          <div class="flex space-x-1">
            <For each={captured().white}>
              {(pieceType) => (
                <span class="text-2xl">{PIECE_SYMBOLS.White[pieceType]}</span>
              )}
            </For>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <span class="font-bold">White captured:</span>
          <div class="flex space-x-1">
            <For each={captured().black}>
              {(pieceType) => (
                <span class="text-2xl">{PIECE_SYMBOLS.Black[pieceType]}</span>
              )}
            </For>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main class="w-full p-4 space-y-4">
      <div class="flex items-center justify-between max-w-[800px] mx-auto">
        <h2 class="font-bold text-3xl">Chess</h2>
        <button
          onClick={handleReset}
          disabled={resetMutation.isPending}
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer disabled:opacity-50"
          type="button"
        >
          {resetMutation.isPending ? "Resetting..." : "Reset Game"}
        </button>
      </div>
      <CapturedPieces />
      <div
        class="messages-container max-w-[800px] mx-auto"
        style={{ "min-height": "1.5rem" }}
      >
        <Show when={errorMsg()}>
          <div class="text-red-500 font-bold">{errorMsg()}</div>
        </Show>
        <Show when={successMsg()}>
          <div class="text-green-500 font-bold">{successMsg()}</div>
        </Show>
      </div>
      <Show
        when={boardQuery.data?.status && boardQuery.data?.status !== "Ongoing"}
      >
        <div class="text-xl font-bold p-4 bg-yellow-100 rounded text-center max-w-[800px] mx-auto">
          Game Over: {boardQuery.data?.status}
        </div>
      </Show>
      <div class="board">
        <For each={Array.from({ length: 64 })}>
          {(_, index) => {
            const squareIndex = index();
            const row = Math.floor(squareIndex / 8);
            const col = squareIndex % 8;
            const isBlack = (row + col) % 2 === 1;

            return (
              <button
                class={`square ${isBlack ? "black" : "white"}`}
                classList={{
                  selected: selectedSquare() === squareIndex,
                  "valid-move": validMoves().includes(squareIndex),
                  "has-piece": !!getPieceAt(squareIndex),
                }}
                onClick={() => {
                  handleSquareClick(squareIndex);
                }}
                type="button"
                aria-label={`Square ${squareIndex}`}
              >
                {(() => {
                  const piece = getPieceAt(squareIndex);
                  return piece
                    ? PIECE_SYMBOLS[piece.color][piece.piece_type]
                    : "";
                })()}
              </button>
            );
          }}
        </For>
      </div>
      <Show when={boardQuery.data}>
        {(b) => <p class="text-center font-bold">Turn: {b().turn}</p>}
      </Show>
      <Show when={boardQuery.isLoading}>
        <p class="text-center">Loading board...</p>
      </Show>
    </main>
  );
}