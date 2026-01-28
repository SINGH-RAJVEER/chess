import { createResource, createSignal, For, Show } from "solid-js";

type Color = "White" | "Black";
type PieceType = "Pawn" | "Knight" | "Bishop" | "Rook" | "Queen" | "King";

interface PieceInfo {
  color: Color;
  piece_type: PieceType;
  square: number;
}

interface BoardResponse {
  pieces: PieceInfo[];
  turn: Color;
}

const fetchBoard = async (): Promise<BoardResponse> => {
  const response = await fetch("http://127.0.0.1:8080/api/board");
  return response.json();
};

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
  const [board, { refetch }] = createResource(fetchBoard);
  const [selectedSquare, setSelectedSquare] = createSignal<number | null>(null);
  const [validMoves, setValidMoves] = createSignal<number[]>([]);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);

  const getPieceAt = (squareIndex: number) => {
    return board()?.pieces.find((p) => p.square === squareIndex);
  };

  const handleSquareClick = async (squareIndex: number) => {
    const currentBoard = board();
    if (!currentBoard) return;

    const clickedPiece = getPieceAt(squareIndex);
    const selected = selectedSquare();

    // Case 1: Select a piece
    // If nothing selected OR clicked own piece (switch selection)
    if (clickedPiece && clickedPiece.color === currentBoard.turn) {
      // If clicking same piece, maybe deselect?
      if (selected === squareIndex) {
          setSelectedSquare(null);
          setValidMoves([]);
          return;
      }
      
      setSelectedSquare(squareIndex);
      setErrorMsg(null);
      
      // Fetch legal moves for this piece
      try {
          const res = await fetch(`http://127.0.0.1:8080/api/moves?square=${squareIndex}`);
          if (res.ok) {
              const moves = await res.json();
              setValidMoves(moves);
          } else {
              setValidMoves([]);
          }
      } catch (e) {
          console.error("Failed to fetch moves", e);
          setValidMoves([]);
      }
      return;
    }

    // Case 2: Move to empty square or capture enemy
    if (selected !== null) {
        // Check if move is in validMoves
        if (validMoves().includes(squareIndex)) {
            try {
              const response = await fetch("http://127.0.0.1:8080/api/move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from: selected, to: squareIndex }),
              });
        
              if (response.ok) {
                setSelectedSquare(null);
                setValidMoves([]);
                setErrorMsg(null);
                refetch();
              } else {
                const text = await response.text();
                setErrorMsg(`Move failed: ${text}`);
              }
            } catch (e) {
              setErrorMsg("Network error");
            }
        } else {
            // Clicked invalid square -> Deselect
            setSelectedSquare(null);
            setValidMoves([]);
        }
    }
  };

  return (
    <main class="w-full p-4 space-y-4">
      <h2 class="font-bold text-3xl">Chess</h2>
      <Show when={errorMsg()}>
        <div class="text-red-500 font-bold">{errorMsg()}</div>
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
              <div 
                class={`square ${isBlack ? "black" : "white"} ${isSelected ? "selected" : ""}`}
                onClick={() => handleSquareClick(squareIndex)}
              >
                {piece ? PIECE_SYMBOLS[piece.color][piece.piece_type] : ""}
                {isValidMove && <div class="valid-move-dot"></div>}
              </div>
            );
          }}
        </For>
      </div>
      <p>Turn: {board()?.turn}</p>
    </main>
  );
}
