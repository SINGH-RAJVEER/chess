import { d as createMemo, s as ssr, t as escape, a as createComponent, p as ssrHydrationKey, S as Show, F as For, w as ssrAttribute, q as ssrStyleProperty, h as createSignal } from "../_libs/solid-js.mjs";
import { u as useQueryClient, b as useQuery, c as useMutation } from "../_chunks/_libs/@tanstack/solid-query.mjs";
import { c as createServerFn, T as TSS_SERVER_FUNCTION, g as getServerFnById } from "./index.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "../_chunks/_libs/@tanstack/query-core.mjs";
import "../_chunks/_libs/@tanstack/history.mjs";
import "../_chunks/_libs/@tanstack/router-core.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/tiny-invariant.mjs";
import "node:stream/web";
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
const createSsrRpc = (functionId, importer) => {
  const url = "/_serverFn/" + functionId;
  const serverFnMeta = { id: functionId };
  const fn = async (...args) => {
    const serverFn = await getServerFnById(functionId);
    return serverFn(...args);
  };
  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const getBoard = createServerFn({
  method: "POST"
}).handler(createSsrRpc("075bb97a5df53025c3a5cac3463aa1757848b60aac35966d56b3f5f04c96a880"));
const undoMove = createServerFn({
  method: "POST"
}).handler(createSsrRpc("794ae25fdbad27267eddca374cd262923ce3a47f4b66b732f323ab20dcc22590"));
createServerFn({
  method: "POST"
}).inputValidator((square) => square).handler(createSsrRpc("7f22913cc8d51a01984f7bf48fae2f2d31d571b490a9d584529e84f9899ea385"));
const makeMove = createServerFn({
  method: "POST"
}).inputValidator((args) => args).handler(createSsrRpc("972086331ae1ccaf15884371b3d836c8b8cb9863f2467b06d69aa6f6555bec6c"));
const resetGame = createServerFn({
  method: "POST"
}).handler(createSsrRpc("614b8f455b0bec4996eb16fc2e9a0377d9b5aca3671eb868a2af8c02e22f2c72"));
var _tmpl$ = ["<span", ' class="text-xs text-stone-300 italic self-center">No captures</span>'], _tmpl$2 = ["<div", ' class="bg-red-600 text-white px-8 py-3 rounded-full shadow-2xl text-base font-bold animate-bounce flex items-center gap-2 border-4 border-white/20"><span>⚠️</span> <!--$-->', "<!--/--></div>"], _tmpl$3 = ["<div", ' class="bg-emerald-600 text-white px-8 py-3 rounded-full shadow-2xl text-base font-bold flex items-center gap-2 border-4 border-white/20"><span>✨</span> <!--$-->', "<!--/--></div>"], _tmpl$4 = ["<div", ' class="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-50 backdrop-blur-md"><div class="bg-white p-12 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.5)] text-center border-b-8 border-indigo-600 animate-in fade-in zoom-in duration-500"><h2 class="text-6xl font-black text-stone-900 mb-4 tracking-tighter">Checkmate</h2><p class="text-2xl font-bold text-indigo-600 mb-10 tracking-wide uppercase">', '</p><button class="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xl shadow-2xl transition-all transform hover:-translate-y-2 active:translate-y-0">New Challenge</button></div></div>'], _tmpl$5 = ["<button", "", ' class="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-indigo-200 transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-2"><span>↺</span> Takeback</button>'], _tmpl$6 = ["<div", ' class="flex gap-2 w-full mt-4"><button class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-2 rounded-xl shadow-lg transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-1"><span>✓</span> Submit</button><button class="flex-1 bg-stone-400 hover:bg-stone-500 text-white font-bold py-3 px-2 rounded-xl shadow-lg transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-1"><span>✕</span> Cancel</button></div>'], _tmpl$7 = ["<span", ' class="text-stone-400 text-sm italic">Waiting for start...</span>'], _tmpl$8 = ["<div", ' class="min-h-screen bg-stone-100 font-sans text-stone-800 flex flex-col"><header class="bg-stone-900 text-white shadow-md px-6 py-3 sticky top-0 z-50 flex justify-between items-center"><div class="flex items-center gap-3"><span class="text-3xl">♛</span><h1 class="text-2xl font-black tracking-tighter uppercase">Chess<span class="text-indigo-500">Master</span></h1></div><nav class="hidden md:flex gap-8 font-bold text-sm text-stone-400 uppercase tracking-widest"><a href="#" class="hover:text-white transition-colors">Play</a><a href="#" class="hover:text-white transition-colors">Analysis</a><a href="#" class="hover:text-white transition-colors">Settings</a></nav><div class="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center font-bold shadow-lg cursor-pointer hover:bg-indigo-500 transition">R</div></header><div class="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 overflow-hidden relative"><div class="flex flex-col xl:flex-row items-center justify-center gap-8 w-full max-w-[1800px]"><div class="flex flex-col gap-6 w-full max-w-[300px] xl:h-[800px] xl:justify-center order-2 xl:order-1"><div class="bg-white p-6 rounded-2xl shadow-xl border border-stone-200 flex flex-col gap-4 items-center text-center relative overflow-hidden group"><div class="absolute inset-0 bg-stone-800/5 opacity-0 group-hover:opacity-100 transition-opacity"></div><div class="w-20 h-20 bg-stone-800 rounded-2xl shadow-inner flex items-center justify-center text-stone-200 font-bold border-4 border-stone-600 text-3xl mb-2">B</div><div><div class="font-extrabold text-2xl leading-tight text-stone-900">Black</div><div class="text-xs text-stone-500 font-bold uppercase tracking-wider">Grandmaster</div></div><div class="flex flex-wrap justify-center gap-1 min-h-[40px] w-full bg-stone-50 rounded-lg p-2 border border-stone-100"><!--$-->', "<!--/--><!--$-->", "<!--/--></div><button", ' class="w-full mt-4 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold py-3 px-6 rounded-xl transition-all uppercase tracking-wider text-sm border-2 border-stone-200 hover:border-stone-300">Restart Game</button></div></div><div class="relative group order-1 xl:order-2"><div class="absolute -top-16 left-0 w-full flex justify-center h-12 pointer-events-none z-30"><!--$-->', "<!--/--><!--$-->", '<!--/--></div><div class="w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-stone-300 rounded-xl shadow-2xl overflow-hidden border-[16px] border-stone-800 relative select-none"><div class="grid grid-cols-8 grid-rows-[repeat(8,1fr)] w-full h-full transition-transform duration-1000 cubic-bezier(0.4, 0, 0.2, 1)" style="', '">', "</div><!--$-->", '<!--/--></div></div><div class="flex flex-col gap-6 w-full max-w-[300px] xl:h-[800px] xl:justify-center order-3"><div class="bg-white p-6 rounded-2xl shadow-xl border-2 border-indigo-100 flex flex-col gap-4 items-center text-center relative overflow-hidden group ring-4 ring-indigo-500/10"><div class="absolute inset-0 bg-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity"></div><div class="w-20 h-20 bg-white border-4 border-stone-200 rounded-2xl shadow-md flex items-center justify-center text-stone-900 font-bold text-3xl mb-2">W</div><div><div class="font-extrabold text-2xl leading-tight text-stone-900">White</div><div class="text-xs text-indigo-600 font-bold uppercase tracking-wider">Your Turn</div></div><div class="flex flex-wrap justify-center gap-1 min-h-[40px] w-full bg-stone-50 rounded-lg p-2 border border-stone-100"><!--$-->', "<!--/--><!--$-->", "<!--/--></div><!--$-->", "<!--/--><!--$-->", '<!--/--></div></div></div></div><div class="bg-white border-t border-stone-200 p-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40"><div class="max-w-[1800px] mx-auto flex items-center gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-stone-300 scrollbar-track-transparent px-4 pb-2"><div class="text-xs font-black text-stone-400 uppercase tracking-widest px-3 py-1 bg-stone-100 rounded-md shrink-0">History</div><div class="flex items-center gap-6 px-2 min-w-max"><!--$-->', "<!--/--><!--$-->", '<!--/--><div id="move-anchor" class="w-2"></div></div></div></div></div>'], _tmpl$9 = ["<span", ' class="text-3xl filter drop-shadow-sm text-stone-800 hover:scale-125 transition-transform cursor-help" title="', '">', "</span>"], _tmpl$0 = ["<span", ' class="', '" style="', '">', "</span>"], _tmpl$1 = ["<button", ' class="', '"><!--$-->', "<!--/--><!--$-->", "<!--/--><!--$-->", "<!--/--><!--$-->", "<!--/--></button>"], _tmpl$10 = ["<div", ' class="absolute inset-0 border-[6px] sm:border-[8px] border-rose-500/50 rounded-full m-1 sm:m-2 pointer-events-none animate-pulse"></div>'], _tmpl$11 = ["<div", ' class="w-4 h-4 sm:w-6 sm:h-6 bg-stone-900/20 rounded-full pointer-events-none"></div>'], _tmpl$12 = ["<span", ' class="text-4xl sm:text-5xl md:text-7xl drop-shadow-2xl transition-all duration-700 ease-in-out cursor-pointer hover:scale-110 active:scale-90 transform-gpu z-20" style="', '">', "</span>"], _tmpl$13 = ["<span", ' class="font-bold text-stone-700 px-2 py-0.5 rounded hover:bg-stone-100 transition-colors cursor-pointer ml-1">', "</span>"], _tmpl$14 = ["<div", ' class="flex items-center text-sm font-mono"><span class="text-stone-300 mr-2 select-none group-hover:text-stone-500 transition-colors"><!--$-->', '<!--/-->.</span><span class="font-bold text-stone-700 px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors cursor-pointer">', "</span><!--$-->", "<!--/--></div>"];
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
  const [rotation] = createSignal(0);
  const [pendingMove, setPendingMove] = createSignal(null);
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
    refetchOnWindowFocus: true
  }));
  useMutation(() => ({
    mutationFn: (args) => makeMove(args),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["board"]
      });
      setPendingMove(null);
    },
    onError: (e) => {
      const msg = e && typeof e === "object" && "message" in e ? e.message : String(e);
      setErrorMsg(`Move failed: ${msg}`);
      setTimeout(() => setErrorMsg(null), 3e3);
      setPendingMove(null);
    }
  }));
  const undoMutation = useMutation(() => ({
    mutationFn: () => undoMove(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["board"]
      });
      setSuccessMsg("Takeback successful!");
      setTimeout(() => setSuccessMsg(null), 2e3);
    },
    onError: (e) => {
      setErrorMsg(`Undo failed: ${e.message}`);
      setTimeout(() => setErrorMsg(null), 3e3);
    }
  }));
  const resetMutation = useMutation(() => ({
    mutationFn: () => resetGame(),
    onSuccess: async () => {
      await boardQuery.refetch();
      setSelectedSquare(null);
      setValidMoves([]);
      setPendingMove(null);
      setErrorMsg(null);
    },
    onError: (e) => {
      setErrorMsg(`Failed to reset game: ${e instanceof Error ? e.message : String(e)}`);
    }
  }));
  const pieces = createMemo(() => {
    const basePieces = boardQuery.data?.pieces || [];
    const pending = pendingMove();
    if (!pending) return basePieces;
    return basePieces.filter((p) => p.square !== pending.to).map((p) => {
      if (p.square === pending.from) {
        return {
          ...p,
          square: pending.to
        };
      }
      return p;
    });
  });
  createMemo(() => boardQuery.data?.turn || "White");
  const [selectedSquare, setSelectedSquare] = createSignal(null);
  const [validMoves, setValidMoves] = createSignal([]);
  const [errorMsg, setErrorMsg] = createSignal(null);
  const [successMsg, setSuccessMsg] = createSignal(null);
  const getPieceAt = (squareIndex) => {
    return pieces().find((p) => p.square === squareIndex);
  };
  return ssr(_tmpl$8, ssrHydrationKey(), escape(createComponent(For, {
    get each() {
      return boardQuery.data?.capturedPieces?.white;
    },
    children: (p) => ssr(_tmpl$9, ssrHydrationKey(), `Captured ${escape(p, true)}`, escape(PIECE_SYMBOLS.White[p]))
  })), escape(createComponent(Show, {
    get when() {
      return !boardQuery.data?.capturedPieces?.white?.length;
    },
    get children() {
      return ssr(_tmpl$, ssrHydrationKey());
    }
  })), ssrAttribute("disabled", resetMutation.isPending, true), escape(createComponent(Show, {
    get when() {
      return errorMsg();
    },
    get children() {
      return ssr(_tmpl$2, ssrHydrationKey(), escape(errorMsg()));
    }
  })), escape(createComponent(Show, {
    get when() {
      return successMsg();
    },
    get children() {
      return ssr(_tmpl$3, ssrHydrationKey(), escape(successMsg()));
    }
  })), ssrStyleProperty("transform:", `rotate(${escape(rotation(), true)}deg)`), escape(createComponent(For, {
    get each() {
      return Array.from({
        length: 64
      });
    },
    children: (_, index) => {
      const squareIndex = index();
      const row = Math.floor(squareIndex / 8);
      const col = squareIndex % 8;
      const isBlack = (row + col) % 2 === 1;
      const lightSquareColor = "bg-[#f0d9b5]";
      const darkSquareColor = "bg-[#b58863]";
      return ssr(_tmpl$1, ssrHydrationKey(), `${`relative w-full h-full flex items-center justify-center focus:outline-none transition-colors duration-200 ${isBlack ? escape(darkSquareColor, true) : escape(lightSquareColor, true)}` || ""} ${selectedSquare() === squareIndex ? "ring-inset ring-[6px] ring-indigo-500/60 z-10" : ""} ${!selectedSquare() || selectedSquare() !== squareIndex ? "hover:brightness-105" : ""}`, escape(createComponent(Show, {
        when: col === 0,
        get children() {
          return ssr(_tmpl$0, ssrHydrationKey(), `absolute left-1 top-1 text-[10px] sm:text-xs font-black ${isBlack ? "text-[#f0d9b5]" : "text-[#b58863]"} opacity-60`, ssrStyleProperty("transform:", `rotate(${rotation() === 180 ? 180 : 0}deg)`), 8 - escape(row));
        }
      })), escape(createComponent(Show, {
        when: row === 7,
        get children() {
          return ssr(_tmpl$0, ssrHydrationKey(), `absolute right-1 bottom-0.5 text-[10px] sm:text-xs font-black ${isBlack ? "text-[#f0d9b5]" : "text-[#b58863]"} opacity-60`, ssrStyleProperty("transform:", `rotate(${rotation() === 180 ? 180 : 0}deg)`), escape(String.fromCharCode(97 + col)));
        }
      })), escape(createComponent(Show, {
        get when() {
          return validMoves().includes(squareIndex);
        },
        get children() {
          return (() => {
            const hasPiece = !!getPieceAt(squareIndex);
            return hasPiece ? ssr(_tmpl$10, ssrHydrationKey()) : ssr(_tmpl$11, ssrHydrationKey());
          })();
        }
      })), (() => {
        const piece = getPieceAt(squareIndex);
        return escape(createComponent(Show, {
          when: piece,
          get children() {
            return ssr(_tmpl$12, ssrHydrationKey(), ssrStyleProperty("transform:", `rotate(${rotation() === 180 ? 180 : 0}deg)`) + ssrStyleProperty(";color:", piece.color === "White" ? "#ffffff" : "#1a1a1a") + ssrStyleProperty(";text-shadow:", piece.color === "White" ? "0 2px 4px rgba(0,0,0,0.4)" : "0 2px 4px rgba(255,255,255,0.1)"), escape(PIECE_SYMBOLS[piece.color][piece.piece_type]));
          }
        }));
      })());
    }
  })), escape(createComponent(Show, {
    get when() {
      return boardQuery.data?.status && boardQuery.data?.status !== "Ongoing";
    },
    get children() {
      return ssr(_tmpl$4, ssrHydrationKey(), escape(boardQuery.data?.status));
    }
  })), escape(createComponent(For, {
    get each() {
      return boardQuery.data?.capturedPieces?.black;
    },
    children: (p) => ssr(_tmpl$9, ssrHydrationKey(), `Captured ${escape(p, true)}`, escape(PIECE_SYMBOLS.Black[p]))
  })), escape(createComponent(Show, {
    get when() {
      return !boardQuery.data?.capturedPieces?.black?.length;
    },
    get children() {
      return ssr(_tmpl$, ssrHydrationKey());
    }
  })), escape(createComponent(Show, {
    get when() {
      return !pendingMove();
    },
    get children() {
      return ssr(_tmpl$5, ssrHydrationKey(), ssrAttribute("disabled", undoMutation.isPending || (boardQuery.data?.moves?.length || 0) === 0, true));
    }
  })), escape(createComponent(Show, {
    get when() {
      return pendingMove();
    },
    get children() {
      return ssr(_tmpl$6, ssrHydrationKey());
    }
  })), escape(createComponent(For, {
    get each() {
      return Array.from({
        length: Math.ceil((boardQuery.data?.moves?.length || 0) / 2)
      });
    },
    children: (_, i) => {
      const index = i();
      const moveIndex = index * 2;
      const whiteMove = boardQuery.data?.moves?.[moveIndex];
      const blackMove = boardQuery.data?.moves?.[moveIndex + 1];
      return ssr(_tmpl$14, ssrHydrationKey(), escape(index) + 1, escape(whiteMove?.notation), escape(createComponent(Show, {
        when: blackMove,
        get children() {
          return ssr(_tmpl$13, ssrHydrationKey(), escape(blackMove?.notation));
        }
      })));
    }
  })), escape(createComponent(Show, {
    get when() {
      return boardQuery.data?.moves?.length === 0;
    },
    get children() {
      return ssr(_tmpl$7, ssrHydrationKey());
    }
  })));
}
export {
  Home as component
};
