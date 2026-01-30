import { h as createSignal, d as createMemo, s as ssr, t as escape, b as createComponent, p as ssrHydrationKey, S as Show, F as For, w as ssrAttribute, q as ssrStyleProperty } from "../_libs/solid-js.mjs";
import { u as useQueryClient, b as useQuery, c as useMutation } from "../_chunks/_libs/@tanstack/solid-query.mjs";
import { H as Header, g as getBoard, u as undoMove, m as makeMove, r as resetGame } from "./header-DQFIH7Ut.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "../_chunks/_libs/@tanstack/query-core.mjs";
import "./index.mjs";
import "../_chunks/_libs/@tanstack/history.mjs";
import "../_chunks/_libs/@tanstack/router-core.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/tiny-invariant.mjs";
import "node:stream/web";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "../_libs/tiny-warning.mjs";
import "../_libs/isbot.mjs";
import "./router-CB2_Gxrc.mjs";
import "./query-BCHCwASR.mjs";
import "../_chunks/_libs/@solid-primitives/refs.mjs";
import "../_chunks/_libs/@solid-primitives/utils.mjs";
var _tmpl$ = ["<span", ' class="text-xs text-stone-600 italic self-center">No captures</span>'], _tmpl$2 = ["<button", "", ' class="w-full mt-4 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-black/20 transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-2"><span>↺</span> Takeback</button>'], _tmpl$3 = ["<span", ">...</span>"], _tmpl$4 = ["<div", ' class="flex gap-2 w-full mt-4"><button', ' class="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-bold py-3 px-2 rounded-xl shadow-lg transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-1">', "</button><button", ' class="flex-1 bg-stone-600 hover:bg-stone-500 disabled:opacity-50 text-white font-bold py-3 px-2 rounded-xl shadow-lg transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-1"><span>✕</span> Cancel</button></div>'], _tmpl$5 = ["<div", ' class="bg-red-600 text-white px-8 py-3 rounded-full shadow-2xl text-base font-bold animate-bounce flex items-center gap-2 border-4 border-stone-900"><span>⚠️</span> <!--$-->', "<!--/--></div>"], _tmpl$6 = ["<div", ' class="bg-emerald-600 text-white px-8 py-3 rounded-full shadow-2xl text-base font-bold flex items-center gap-2 border-4 border-stone-900"><span>✨</span> <!--$-->', "<!--/--></div>"], _tmpl$7 = ["<div", ' class="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-50 backdrop-blur-md"><div class="bg-stone-800 p-12 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.5)] text-center border-b-8 border-indigo-600 animate-in fade-in zoom-in duration-500"><h2 class="text-6xl font-black text-stone-100 mb-4 tracking-tighter">', '</h2><p class="text-2xl font-bold text-indigo-400 mb-10 tracking-wide uppercase">', '</p><button class="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xl shadow-2xl transition-all transform hover:-translate-y-2 active:translate-y-0">New Challenge</button></div></div>'], _tmpl$8 = ["<button", "", ' class="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-black/20 transition-all uppercase tracking-wider text-sm flex items-center justify-center gap-2"><span>↺</span> Takeback</button>'], _tmpl$9 = ["<span", ' class="text-stone-600 text-sm italic">Waiting for start...</span>'], _tmpl$0 = ["<div", ' class="min-h-screen bg-gradient-to-br from-stone-900 via-stone-900 to-black font-sans text-stone-200 flex flex-col"><!--$-->', '<!--/--><div class="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 overflow-hidden relative"><div class="flex flex-col xl:flex-row items-center justify-center gap-8 w-full max-w-[1800px]"><div class="flex flex-col gap-6 w-full max-w-[300px] xl:h-[800px] xl:justify-center order-2 xl:order-1"><div class="bg-stone-800 p-6 rounded-2xl shadow-xl border border-stone-700 flex flex-col gap-4 items-center text-center relative overflow-hidden"><div class="w-20 h-20 bg-black rounded-2xl shadow-inner flex items-center justify-center text-stone-200 font-bold border-4 border-stone-700 text-3xl mb-2">B</div><div><div class="font-extrabold text-2xl leading-tight text-stone-100">Black</div><div class="', '">', '</div><div class="', '">', '</div></div><div class="flex flex-wrap justify-center gap-1 min-h-[40px] w-full bg-stone-900/50 rounded-lg p-2 border border-stone-700"><!--$-->', "<!--/--><!--$-->", "<!--/--></div><!--$-->", '<!--/--></div></div><div class="relative group order-1 xl:order-2"><div class="absolute -top-16 left-0 w-full flex justify-center h-12 pointer-events-none z-30"><!--$-->', "<!--/--><!--$-->", '<!--/--></div><div class="w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-stone-700 rounded-xl shadow-2xl overflow-hidden border-[16px] border-stone-950 relative select-none"><div class="grid grid-cols-8 grid-rows-[repeat(8,1fr)] w-full h-full transition-transform duration-1000 cubic-bezier(0.4, 0, 0.2, 1)" style="', '">', "</div><!--$-->", '<!--/--></div></div><div class="flex flex-col gap-6 w-full max-w-[300px] xl:h-[800px] xl:justify-center order-3"><div class="bg-stone-800 p-6 rounded-2xl shadow-xl border border-stone-700 flex flex-col gap-4 items-center text-center relative overflow-hidden"><div class="w-20 h-20 bg-stone-200 border-4 border-stone-500 rounded-2xl shadow-md flex items-center justify-center text-stone-900 font-bold text-3xl mb-2">W</div><div><div class="font-extrabold text-2xl leading-tight text-stone-100">White</div><div class="', '">', '</div><div class="', '">', '</div></div><div class="flex flex-wrap justify-center gap-1 min-h-[40px] w-full bg-stone-900/50 rounded-lg p-2 border border-stone-700"><!--$-->', "<!--/--><!--$-->", "<!--/--></div><!--$-->", '<!--/--></div></div></div></div><div class="bg-stone-900 border-t border-stone-800 p-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.5)] z-40"><div class="max-w-[1800px] mx-auto flex items-center gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-stone-600 scrollbar-track-stone-900 px-4 pb-2"><div class="text-xs font-black text-stone-500 uppercase tracking-widest px-3 py-1 bg-stone-800 rounded-md shrink-0">History</div><div class="flex items-center gap-6 px-2 min-w-max"><!--$-->', "<!--/--><!--$-->", '<!--/--><div id="move-anchor" class="w-2"></div></div></div></div></div>'], _tmpl$1 = ["<span", ' class="text-3xl filter drop-shadow-sm text-stone-400 hover:scale-125 transition-transform cursor-help" title="', '">', "</span>"], _tmpl$10 = ["<span", ">✓ Submit</span>"], _tmpl$11 = ["<span", ' class="', '" style="', '">', "</span>"], _tmpl$12 = ["<div", ' class="absolute inset-0 bg-yellow-500/60 pointer-events-none mix-blend-hard-light"></div>'], _tmpl$13 = ["<button", ' class="', '"><!--$-->', "<!--/--><!--$-->", "<!--/--><!--$-->", "<!--/--><!--$-->", "<!--/--><!--$-->", "<!--/--></button>"], _tmpl$14 = ["<div", ' class="absolute inset-0 border-[6px] sm:border-[8px] border-rose-500/50 rounded-full m-1 sm:m-2 pointer-events-none animate-pulse"></div>'], _tmpl$15 = ["<div", ' class="w-4 h-4 sm:w-6 sm:h-6 bg-stone-900/40 rounded-full pointer-events-none"></div>'], _tmpl$16 = ["<span", ' class="text-4xl sm:text-5xl md:text-7xl drop-shadow-2xl transition-all duration-700 ease-in-out cursor-pointer hover:scale-110 active:scale-90 transform-gpu z-20" style="', '">', "</span>"], _tmpl$17 = ["<span", ' class="font-bold text-stone-300 px-2 py-0.5 rounded hover:bg-stone-800 transition-colors cursor-pointer ml-1">', "</span>"], _tmpl$18 = ["<div", ' class="flex items-center text-sm font-mono"><span class="text-stone-600 mr-2 select-none group-hover:text-stone-500 transition-colors"><!--$-->', '<!--/-->.</span><span class="font-bold text-stone-300 px-2 py-0.5 rounded hover:bg-stone-800 transition-colors cursor-pointer">', "</span><!--$-->", "<!--/--></div>"];
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
  const [pendingMove, setPendingMove] = createSignal(storedMoves());
  const boardQuery = useQuery(() => ({
    queryKey: ["board"],
    queryFn: async () => {
      try {
        return await getBoard({
          data: {
            mode: "vs_player"
          }
        });
      } catch (e) {
        console.error("✗ Failed to fetch board:", e);
        throw e;
      }
    },
    staleTime: 0,
    refetchOnWindowFocus: true
  }));
  const moveMutation = useMutation(() => ({
    mutationFn: (args) => {
      if (!boardQuery.data?.id) throw new Error("Game ID not found");
      return makeMove({
        data: {
          ...args.data,
          gameId: boardQuery.data.id
        }
      });
    },
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
    }
  }));
  const undoMutation = useMutation(() => ({
    mutationFn: () => {
      if (!boardQuery.data?.id) throw new Error("Game ID not found");
      return undoMove({
        data: {
          gameId: boardQuery.data.id
        }
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["board"]
      });
      setTimeout(() => setSuccessMsg(null), 2e3);
    },
    onError: (e) => {
      setErrorMsg(`Undo failed: ${e.message}`);
      setTimeout(() => setErrorMsg(null), 3e3);
    }
  }));
  const resetMutation = useMutation(() => ({
    mutationFn: (opts) => resetGame({
      data: opts
    }),
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
  const [now] = createSignal(Date.now());
  const formatTime = (ms) => {
    if (boardQuery.data?.timeControl === 0) return "∞";
    const totalSeconds = Math.max(0, Math.floor(ms / 1e3));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };
  const whiteTime = createMemo(() => {
    if (!boardQuery.data) return 0;
    const {
      turn: turn2,
      status,
      whiteTimeRemaining,
      lastMoveTime,
      timeControl
    } = boardQuery.data;
    if (timeControl === 0) return Number.MAX_SAFE_INTEGER;
    if (turn2 === "White" && status === "Ongoing" && lastMoveTime) {
      const elapsed = now() - lastMoveTime;
      return Math.max(0, whiteTimeRemaining - elapsed);
    }
    return whiteTimeRemaining;
  });
  const blackTime = createMemo(() => {
    if (!boardQuery.data) return 0;
    const {
      turn: turn2,
      status,
      blackTimeRemaining,
      lastMoveTime,
      timeControl
    } = boardQuery.data;
    if (timeControl === 0) return Number.MAX_SAFE_INTEGER;
    if (turn2 === "Black" && status === "Ongoing" && lastMoveTime) {
      const elapsed = now() - lastMoveTime;
      return Math.max(0, blackTimeRemaining - elapsed);
    }
    return blackTimeRemaining;
  });
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
  const turn = createMemo(() => boardQuery.data?.turn || "White");
  const [selectedSquare, setSelectedSquare] = createSignal(null);
  const [validMoves, setValidMoves] = createSignal([]);
  const [errorMsg, setErrorMsg] = createSignal(null);
  const [successMsg, setSuccessMsg] = createSignal(null);
  const getPieceAt = (squareIndex) => {
    return pieces().find((p) => p.square === squareIndex);
  };
  const handleReset = (opts) => {
    resetMutation.mutate(opts || {
      mode: "vs_player",
      timeControl: 10
    });
  };
  return ssr(_tmpl$0, ssrHydrationKey(), escape(createComponent(Header, {
    onRestart: handleReset,
    get isRestarting() {
      return resetMutation.isPending;
    },
    activeMode: "vs_player",
    get currentTimeControl() {
      return boardQuery.data?.timeControl;
    }
  })), `text-xs font-bold uppercase tracking-wider ${turn() === "Black" ? "text-emerald-400" : "text-stone-500"}`, turn() === "Black" ? "Your Turn" : "Waiting", `text-4xl font-mono font-bold mt-2 ${turn() === "Black" ? "text-white" : "text-stone-600"}`, escape(formatTime(blackTime())), escape(createComponent(For, {
    get each() {
      return boardQuery.data?.capturedPieces?.white;
    },
    children: (p) => ssr(_tmpl$1, ssrHydrationKey(), `Captured ${escape(p, true)}`, escape(PIECE_SYMBOLS.White[p]))
  })), escape(createComponent(Show, {
    get when() {
      return !boardQuery.data?.capturedPieces?.white?.length;
    },
    get children() {
      return ssr(_tmpl$, ssrHydrationKey());
    }
  })), escape(createComponent(Show, {
    get when() {
      return turn() === "White" && (boardQuery.data?.moves?.length || 0) > 0 || turn() === "Black" && pendingMove();
    },
    get children() {
      return [createComponent(Show, {
        get when() {
          return turn() === "White";
        },
        get children() {
          return ssr(_tmpl$2, ssrHydrationKey(), ssrAttribute("disabled", undoMutation.isPending || (boardQuery.data?.moves?.length || 0) === 0, true));
        }
      }), createComponent(Show, {
        get when() {
          return turn() === "Black" && pendingMove();
        },
        get children() {
          return ssr(_tmpl$4, ssrHydrationKey(), ssrAttribute("disabled", moveMutation.isPending, true), escape(createComponent(Show, {
            get when() {
              return moveMutation.isPending;
            },
            get fallback() {
              return ssr(_tmpl$10, ssrHydrationKey());
            },
            get children() {
              return ssr(_tmpl$3, ssrHydrationKey());
            }
          })), ssrAttribute("disabled", moveMutation.isPending, true));
        }
      })];
    }
  })), escape(createComponent(Show, {
    get when() {
      return errorMsg();
    },
    get children() {
      return ssr(_tmpl$5, ssrHydrationKey(), escape(errorMsg()));
    }
  })), escape(createComponent(Show, {
    get when() {
      return successMsg();
    },
    get children() {
      return ssr(_tmpl$6, ssrHydrationKey(), escape(successMsg()));
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
      const isLastMove = () => {
        const lastMove = boardQuery.data?.lastMove;
        return lastMove && (lastMove.from === squareIndex || lastMove.to === squareIndex);
      };
      return ssr(_tmpl$13, ssrHydrationKey(), `${`relative w-full h-full flex items-center justify-center focus:outline-none transition-colors duration-200 ${isBlack ? escape(darkSquareColor, true) : escape(lightSquareColor, true)}` || ""} ${selectedSquare() === squareIndex ? "ring-inset ring-[6px] ring-indigo-500/60 z-10" : ""} ${!selectedSquare() || selectedSquare() !== squareIndex ? "hover:brightness-105" : ""}`, escape(createComponent(Show, {
        when: col === 0,
        get children() {
          return ssr(_tmpl$11, ssrHydrationKey(), `absolute left-1 top-1 text-[10px] sm:text-xs font-black ${isBlack ? "text-[#f0d9b5]" : "text-[#b58863]"} opacity-60`, ssrStyleProperty("transform:", `rotate(${rotation() === 180 ? 180 : 0}deg)`), 8 - escape(row));
        }
      })), escape(createComponent(Show, {
        when: row === 7,
        get children() {
          return ssr(_tmpl$11, ssrHydrationKey(), `absolute right-1 bottom-0.5 text-[10px] sm:text-xs font-black ${isBlack ? "text-[#f0d9b5]" : "text-[#b58863]"} opacity-60`, ssrStyleProperty("transform:", `rotate(${rotation() === 180 ? 180 : 0}deg)`), escape(String.fromCharCode(97 + col)));
        }
      })), escape(createComponent(Show, {
        get when() {
          return isLastMove();
        },
        get children() {
          return ssr(_tmpl$12, ssrHydrationKey());
        }
      })), escape(createComponent(Show, {
        get when() {
          return validMoves().includes(squareIndex);
        },
        get children() {
          return (() => {
            const hasPiece = !!getPieceAt(squareIndex);
            return hasPiece ? ssr(_tmpl$14, ssrHydrationKey()) : ssr(_tmpl$15, ssrHydrationKey());
          })();
        }
      })), (() => {
        const piece = getPieceAt(squareIndex);
        return escape(createComponent(Show, {
          when: piece,
          get children() {
            return ssr(_tmpl$16, ssrHydrationKey(), ssrStyleProperty("transform:", `rotate(${rotation() === 180 ? 180 : 0}deg)`) + ssrStyleProperty(";color:", piece.color === "White" ? "#ffffff" : "#1a1a1a") + ssrStyleProperty(";text-shadow:", piece.color === "White" ? "0 2px 4px rgba(0,0,0,0.4)" : "0 2px 4px rgba(255,255,255,0.1)"), escape(PIECE_SYMBOLS[piece.color][piece.piece_type]));
          }
        }));
      })());
    }
  })), escape(createComponent(Show, {
    get when() {
      return boardQuery.data?.status && boardQuery.data?.status !== "Ongoing";
    },
    get children() {
      return ssr(_tmpl$7, ssrHydrationKey(), boardQuery.data?.status === "Timeout" ? "Time Out!" : escape(boardQuery.data?.status), (() => {
        const status = boardQuery.data?.status;
        const turn2 = boardQuery.data?.turn;
        if (status === "Stalemate") return "Draw";
        const winner = turn2 === "White" ? "Black" : "White";
        if (status === "Timeout") return `${winner} Wins by Time`;
        return `${escape(winner)} Wins`;
      })());
    }
  })), `text-xs font-bold uppercase tracking-wider ${turn() === "White" ? "text-emerald-400" : "text-stone-500"}`, turn() === "White" ? "Your Turn" : "Waiting", `text-4xl font-mono font-bold mt-2 ${turn() === "White" ? "text-white" : "text-stone-600"}`, escape(formatTime(whiteTime())), escape(createComponent(For, {
    get each() {
      return boardQuery.data?.capturedPieces?.black;
    },
    children: (p) => ssr(_tmpl$1, ssrHydrationKey(), `Captured ${escape(p, true)}`, escape(PIECE_SYMBOLS.Black[p]))
  })), escape(createComponent(Show, {
    get when() {
      return !boardQuery.data?.capturedPieces?.black?.length;
    },
    get children() {
      return ssr(_tmpl$, ssrHydrationKey());
    }
  })), escape(createComponent(Show, {
    get when() {
      return turn() === "Black" || turn() === "White" && pendingMove();
    },
    get children() {
      return [createComponent(Show, {
        get when() {
          return turn() === "Black";
        },
        get children() {
          return ssr(_tmpl$8, ssrHydrationKey(), ssrAttribute("disabled", undoMutation.isPending || (boardQuery.data?.moves?.length || 0) === 0, true));
        }
      }), createComponent(Show, {
        get when() {
          return turn() === "White" && pendingMove();
        },
        get children() {
          return ssr(_tmpl$4, ssrHydrationKey(), ssrAttribute("disabled", moveMutation.isPending, true), escape(createComponent(Show, {
            get when() {
              return moveMutation.isPending;
            },
            get fallback() {
              return ssr(_tmpl$10, ssrHydrationKey());
            },
            get children() {
              return ssr(_tmpl$3, ssrHydrationKey());
            }
          })), ssrAttribute("disabled", moveMutation.isPending, true));
        }
      })];
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
      return ssr(_tmpl$18, ssrHydrationKey(), escape(index) + 1, escape(whiteMove?.notation), escape(createComponent(Show, {
        when: blackMove,
        get children() {
          return ssr(_tmpl$17, ssrHydrationKey(), escape(blackMove?.notation));
        }
      })));
    }
  })), escape(createComponent(Show, {
    get when() {
      return boardQuery.data?.moves?.length === 0;
    },
    get children() {
      return ssr(_tmpl$9, ssrHydrationKey());
    }
  })));
}
export {
  Home as component
};
