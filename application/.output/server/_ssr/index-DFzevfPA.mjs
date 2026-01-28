import { d as createMemo, s as ssr, t as escape, a as createComponent, p as ssrHydrationKey, S as Show, F as For, q as ssrStyleProperty, w as ssrAttribute, h as createSignal } from "../_libs/solid-js.mjs";
import { u as useQueryClient, c as createQuery, b as createMutation } from "../_chunks/_libs/@tanstack/solid-query.mjs";
import { m as makeMove, a as getMoves, g as getBoard, r as resetGame } from "./router-DcnGiUVs.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "../_chunks/_libs/@tanstack/query-core.mjs";
import "../_chunks/_libs/@tanstack/router-core.mjs";
import "../_libs/cookie-es.mjs";
import "../_chunks/_libs/@tanstack/history.mjs";
import "../_libs/tiny-invariant.mjs";
import "node:stream/web";
import "../_chunks/_libs/@solid-primitives/refs.mjs";
import "../_chunks/_libs/@solid-primitives/utils.mjs";
import "./index.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "node:http";
import "node:stream";
import "node:https";
import "node:http2";
import "../_libs/tiny-warning.mjs";
import "../_libs/isbot.mjs";
var _tmpl$ = ["<div", ' class="flex justify-between max-w-[800px] mx-auto mb-4"><div class="flex items-center space-x-2"><span class="font-bold">Black captured:</span><div class="flex space-x-1">', '</div></div><div class="flex items-center space-x-2"><span class="font-bold">White captured:</span><div class="flex space-x-1">', "</div></div></div>"], _tmpl$2 = ["<span", ' class="text-2xl">', "</span>"], _tmpl$3 = ["<div", ' class="text-red-500 font-bold">', "</div>"], _tmpl$4 = ["<div", ' class="text-green-500 font-bold">', "</div>"], _tmpl$5 = ["<div", ' class="text-xl font-bold p-4 bg-yellow-100 rounded text-center max-w-[800px] mx-auto">Game Over: <!--$-->', "<!--/--></div>"], _tmpl$6 = ["<p", ' class="text-center">Loading board...</p>'], _tmpl$7 = ["<main", ' class="w-full p-4 space-y-4"><div class="flex items-center justify-between max-w-[800px] mx-auto"><h2 class="font-bold text-3xl">Chess</h2><button', ' class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer disabled:opacity-50" type="button">', "</button></div><!--$-->", '<!--/--><div class="messages-container max-w-[800px] mx-auto" style="', '"><!--$-->', "<!--/--><!--$-->", "<!--/--></div><!--$-->", '<!--/--><div class="board"><div style="position:absolute;top:-150px;left:820px;font-size:10px;background:white;padding:10px;border:1px solid black;"><h4>Debug Info:</h4><div>Total pieces: <!--$-->', "<!--/--></div><div>Turn: <!--$-->", "<!--/--></div><div>Selected: <!--$-->", "<!--/--></div><div>Valid moves: <!--$-->", "<!--/--></div><div>Board loaded: <!--$-->", "<!--/--></div><div>First 5 pieces: <!--$-->", "<!--/--></div><div>Error: <!--$-->", "<!--/--></div></div><!--$-->", "<!--/--></div><!--$-->", "<!--/--><!--$-->", "<!--/--></main>"], _tmpl$8 = ["<button", ' class="', '" type="button" aria-label="', '">', "</button>"], _tmpl$9 = ["<p", ' class="text-center font-bold">Turn: <!--$-->', "<!--/--></p>"];
console.log("API functions loaded:", {
  getBoard: !!getBoard,
  getMoves: !!getMoves,
  makeMove: !!makeMove
});
const PIECE_SYMBOLS = {
  White: {
    Pawn: "♙",
    Knight: "♘",
    Bishop: "♗",
    Rook: "♖",
    Queen: "♕",
    King: "♔"
  },
  Black: {
    Pawn: "♟",
    Knight: "♞",
    Bishop: "♝",
    Rook: "♜",
    Queen: "♛",
    King: "♚"
  }
};
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
    }
  }));
  createMutation(() => ({
    mutationFn: (args) => makeMove(args),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["board"]
      });
      setSuccessMsg("Move successful!");
      setTimeout(() => setSuccessMsg(null), 2e3);
    },
    onError: (e) => {
      setErrorMsg(`Move failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }));
  const resetMutation = createMutation(() => ({
    mutationFn: () => resetGame(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["board"]
      });
      setSelectedSquare(null);
      setValidMoves([]);
      setErrorMsg(null);
    },
    onError: (e) => {
      setErrorMsg(`Failed to reset game: ${e instanceof Error ? e.message : String(e)}`);
    }
  }));
  const pieces = createMemo(() => boardQuery.data?.pieces || []);
  const [selectedSquare, setSelectedSquare] = createSignal(null);
  const [validMoves, setValidMoves] = createSignal([]);
  const [errorMsg, setErrorMsg] = createSignal(null);
  const [successMsg, setSuccessMsg] = createSignal(null);
  const getPieceAt = (squareIndex) => {
    return pieces().find((p) => p.square === squareIndex);
  };
  const CapturedPieces = () => {
    const captured = createMemo(() => boardQuery.data?.capturedPieces || {
      white: [],
      black: []
    });
    return ssr(_tmpl$, ssrHydrationKey(), escape(createComponent(For, {
      get each() {
        return captured().white;
      },
      children: (pieceType) => ssr(_tmpl$2, ssrHydrationKey(), escape(PIECE_SYMBOLS.White[pieceType]))
    })), escape(createComponent(For, {
      get each() {
        return captured().black;
      },
      children: (pieceType) => ssr(_tmpl$2, ssrHydrationKey(), escape(PIECE_SYMBOLS.Black[pieceType]))
    })));
  };
  return ssr(_tmpl$7, ssrHydrationKey(), ssrAttribute("disabled", resetMutation.isPending, true), resetMutation.isPending ? "Resetting..." : "Reset Game", escape(createComponent(CapturedPieces, {})), ssrStyleProperty("min-height:", "1.5rem"), escape(createComponent(Show, {
    get when() {
      return errorMsg();
    },
    get children() {
      return ssr(_tmpl$3, ssrHydrationKey(), escape(errorMsg()));
    }
  })), escape(createComponent(Show, {
    get when() {
      return successMsg();
    },
    get children() {
      return ssr(_tmpl$4, ssrHydrationKey(), escape(successMsg()));
    }
  })), escape(createComponent(Show, {
    get when() {
      return boardQuery.data?.status && boardQuery.data?.status !== "Ongoing";
    },
    get children() {
      return ssr(_tmpl$5, ssrHydrationKey(), escape(boardQuery.data?.status));
    }
  })), escape(pieces().length), escape(boardQuery.data?.turn), escape(selectedSquare()), escape(validMoves().length), boardQuery.isLoading ? "Loading" : "Loaded", escape(pieces().slice(0, 5).map((p) => `${p.color[0]}${p.piece_type[0]}@${p.square}`).join(", ")), escape(errorMsg()), escape(createComponent(For, {
    get each() {
      return Array.from({
        length: 64
      });
    },
    children: (item, index) => {
      const squareIndex = index();
      const row = Math.floor(squareIndex / 8);
      const col = squareIndex % 8;
      const isBlack = (row + col) % 2 === 1;
      const piece = getPieceAt(squareIndex);
      const isSelected = selectedSquare() === squareIndex;
      const isValidMove = validMoves().includes(squareIndex);
      const debugClass = squareIndex >= 56 && squareIndex <= 63 ? "debug-square" : "";
      return ssr(_tmpl$8, ssrHydrationKey(), `square ${isBlack ? "black" : "white"} ${isSelected ? "selected" : ""} ${isValidMove ? "valid-move" : ""} ${piece ? "has-piece" : ""} ${escape(debugClass, true)}`, `Square ${escape(squareIndex, true)}`, piece ? escape(PIECE_SYMBOLS[piece.color][piece.piece_type]) : "");
    }
  })), escape(createComponent(Show, {
    get when() {
      return boardQuery.data;
    },
    children: (b) => ssr(_tmpl$9, ssrHydrationKey(), escape(b().turn))
  })), escape(createComponent(Show, {
    get when() {
      return boardQuery.isLoading;
    },
    get children() {
      return ssr(_tmpl$6, ssrHydrationKey());
    }
  })));
}
export {
  Home as component
};
