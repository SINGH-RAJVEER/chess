import { createSignal, For, Show, createMemo } from "solid-js";
import { createFileRoute } from "@tanstack/solid-router";
import {
  createQuery,
  createMutation,
  useQueryClient,
} from "@tanstack/solid-query";
import { getBoard, getMoves, makeMove, resetGame } from "../lib/api";
import type { Color, PieceType } from "../lib/api";

// Test: Direct import to see if functions work
console.log("API functions loaded:", {
  getBoard: !!getBoard,
  getMoves: !!getMoves,
  makeMove: !!makeMove,
});

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
      console.log("Fetching board...");
      try {
        const result = await getBoard();
        console.log("✓ Board fetched successfully:", result);
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
      await boardQuery.refetch();
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
    console.log(`\n=== CLICK DEBUG ===`);
    console.log(`Clicked square:`, squareIndex);
    if (
      typeof squareIndex !== "number" ||
      isNaN(squareIndex) ||
      squareIndex < 0 ||
      squareIndex > 63
    ) {
      console.warn(
        "Invalid squareIndex passed to handleSquareClick:",
        squareIndex,
      );
      setErrorMsg("Invalid square selected.");
      return;
    }
    console.log(`Board data exists: ${!!boardQuery.data}`);
    console.log(`Pieces length: ${pieces().length}`);

    if (!boardQuery.data) {
      console.log("No board data - returning");
      return;
    }

    const currentPieces = pieces();
    const clickedPiece = currentPieces.find((p) => p.square === squareIndex);
    const selected = selectedSquare();

    console.log(`Current turn: ${boardQuery.data.turn}`);
    console.log(`Clicked piece:`, clickedPiece);
    console.log(`Selected square: ${selected}`);

    // Case 1: Select a piece
    if (clickedPiece && clickedPiece.color === boardQuery.data.turn) {
      console.log(
        `✓ Should select piece - matching turn (${clickedPiece.color})`,
      );
      if (selected === squareIndex) {
        console.log("Deselecting same square");
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }

      console.log(`Setting selected square to: ${squareIndex}`);
      setSelectedSquare(squareIndex);
      setErrorMsg(null);

      try {
        if (
          typeof squareIndex === "number" &&
          !isNaN(squareIndex) &&
          squareIndex >= 0 &&
          squareIndex <= 63
        ) {
          console.log(`Calling getMoves for square: ${squareIndex}`);
          // Patch: call getMoves with correct input shape
          const moves = await getMoves({ data: squareIndex });
          console.log(`✓ Got moves from API:`, moves);
          setValidMoves(Array.isArray(moves) ? moves : []);
          console.log(
            `Set valid moves, length: ${Array.isArray(moves) ? moves.length : "N/A"}`,
          );
        } else {
          console.warn(
            "Attempted to call getMoves with invalid squareIndex:",
            squareIndex,
          );
          setValidMoves([]);
        }
      } catch (e) {
        console.error("✗ Failed to fetch moves:", e);
        setErrorMsg(`API Error: ${e?.message || "Unknown error"}`);
        setValidMoves([]);
      }
      return;
    } else if (clickedPiece) {
      console.log(
        `✗ Cannot select piece - wrong turn. Piece: ${clickedPiece.color}, Turn: ${boardQuery.data.turn}`,
      );
      setErrorMsg("Not your turn!");
    } else {
      console.log("✗ No piece clicked");
    }

    // Case 2: Move
    if (selected !== null) {
      console.log(`Checking move from ${selected} to ${squareIndex}`);
      console.log(`Current valid moves:`, validMoves());

      if (
        validMoves().includes(squareIndex) &&
        typeof selected === "number" &&
        !isNaN(selected) &&
        typeof squareIndex === "number" &&
        !isNaN(squareIndex)
      ) {
        console.log("✓ Valid move - executing");
        moveMutation.mutate({ data: { from: selected, to: squareIndex } });
        setSelectedSquare(null);
        setValidMoves([]);
      } else {
        console.log("✗ Invalid move or different target");
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      console.log("No piece selected - cannot move");
    }

    console.log(`=== END CLICK DEBUG ===\n`);
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
        {/* Debug info */}
        <div style="position: absolute; top: -150px; left: 820px; font-size: 10px; background: white; padding: 10px; border: 1px solid black;">
          <h4>Debug Info:</h4>
          <div>Total pieces: {pieces().length}</div>
          <div>Turn: {boardQuery.data?.turn}</div>
          <div>Selected: {selectedSquare()}</div>
          <div>Valid moves: {validMoves().length}</div>
          <div>Board loaded: {boardQuery.isLoading ? "Loading" : "Loaded"}</div>
          <div>
            First 5 pieces:{" "}
            {pieces()
              .slice(0, 5)
              .map((p) => `${p.color[0]}${p.piece_type[0]}@${p.square}`)
              .join(", ")}
          </div>
          <div>Error: {errorMsg()}</div>
        </div>
        <For each={Array.from({ length: 64 })}>
          {(_, index) => {
            const squareIndex = index();
            const row = Math.floor(squareIndex / 8);
            const col = squareIndex % 8;

            const isBlack = (row + col) % 2 === 1;
            const piece = getPieceAt(squareIndex);
            const isSelected = selectedSquare() === squareIndex;
            const isValidMove = validMoves().includes(squareIndex);

            // Debug styling - only show first few squares
            const debugClass =
              squareIndex >= 56 && squareIndex <= 63 ? "debug-square" : "";

            return (
              <button
                class={`square ${isBlack ? "black" : "white"} ${isSelected ? "selected" : ""} ${isValidMove ? "valid-move" : ""} ${piece ? "has-piece" : ""} ${debugClass}`}
                onClick={() => {
                  console.log(
                    `Clicking square ${squareIndex} (row ${row}, col ${col})`,
                  );
                  handleSquareClick(squareIndex);
                }}
                type="button"
                aria-label={`Square ${squareIndex}`}
              >
                {piece ? PIECE_SYMBOLS[piece.color][piece.piece_type] : ""}
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
