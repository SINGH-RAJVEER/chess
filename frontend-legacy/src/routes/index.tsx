import { createSignal, For, Show, createMemo } from "solid-js";
import { createAsync } from "@solidjs/router";
import { getBoard, getMoves, makeMove, resetGame } from "../api";
import type { Color, PieceType } from "../api/types";

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

export default function Home() {
  const board = createAsync(() => getBoard());
  const pieces = createMemo(() => board()?.pieces || []);
  
  const [selectedSquare, setSelectedSquare] = createSignal<number | null>(null);
  const [validMoves, setValidMoves] = createSignal<number[]>([]);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [successMsg, setSuccessMsg] = createSignal<string | null>(null);

  const getPieceAt = (squareIndex: number) => {
    return pieces().find((p) => p.square === squareIndex);
  };

  const handleSquareClick = async (squareIndex: number) => {
    const currentBoard = board();
    if (!currentBoard) return;
    
    const currentPieces = pieces();
    const clickedPiece = currentPieces.find((p) => p.square === squareIndex);
    const selected = selectedSquare();

    // Case 1: Select a piece
    if (clickedPiece && clickedPiece.color === currentBoard.turn) {
      if (selected === squareIndex) {
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }

      setSelectedSquare(squareIndex);
      setErrorMsg(null);

      try {
        const moves = await getMoves(squareIndex);
        setValidMoves(moves);
      } catch (e) {
        console.error("Failed to fetch moves", e);
        setValidMoves([]);
      }
      return;
    }

    // Case 2: Move
    if (selected !== null) {
      if (validMoves().includes(squareIndex)) {
        try {
          await makeMove({ from: selected, to: squareIndex });
          setSelectedSquare(null);
          setValidMoves([]);
          setErrorMsg(null);
          setSuccessMsg("Move successful!");
          setTimeout(() => setSuccessMsg(null), 2000);
        } catch (e: unknown) {
          setErrorMsg(`Move failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    }
  };

  const handleReset = async () => {
    try {
      await resetGame();
      setSelectedSquare(null);
      setValidMoves([]);
      setErrorMsg(null);
    } catch (e: unknown) {
      console.error("Reset game error:", e);
      setErrorMsg(`Failed to reset game: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <main class="w-full p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-3xl">Chess</h2>
        <button
          onClick={handleReset}
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          type="button"
        >
          Reset Game
        </button>
      </div>
      <div class="messages-container" style={{ "min-height": "1.5rem" }}>
        <Show when={errorMsg()}>
          <div class="text-red-500 font-bold">{errorMsg()}</div>
        </Show>
        <Show when={successMsg()}>
          <div class="text-green-500 font-bold">{successMsg()}</div>
        </Show>
      </div>
      <Show when={board()?.status && board()?.status !== "Ongoing"}>
        <div class="text-xl font-bold p-4 bg-yellow-100 rounded text-center">
          Game Over: {board()?.status}
        </div>
      </Show>
      <div class="board">
        <For each={Array.from({ length: 64 })}>
          {(_, i) => {
            const row = Math.floor(i() / 8);
            const col = i() % 8;

            const displayRow = 7 - row;
            const displayCol = col;
            const squareIndex = displayRow * 8 + displayCol;

            const isBlack = (row + col) % 2 === 1;
            const piece = getPieceAt(squareIndex);
            const isSelected = selectedSquare() === squareIndex;
            const isValidMove = validMoves().includes(squareIndex);

            return (
              <button
                class={`square ${isBlack ? "black" : "white"} ${isSelected ? "selected" : ""} ${isValidMove ? "valid-move" : ""} ${piece ? "has-piece" : ""}`}
                onClick={() => handleSquareClick(squareIndex)}
                type="button"
                aria-label={`Square ${squareIndex}`}
              >
                {piece ? PIECE_SYMBOLS[piece.color][piece.piece_type] : ""}
              </button>
            );
          }}
        </For>
      </div>
      <Show when={board()}>{(b) => <p>Turn: {b().turn}</p>}</Show>
    </main>
  );
}
