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

export const Route = createFileRoute("/computer")({
	component: ComputerGame,
});

function ComputerGame() {
	const queryClient = useQueryClient();
	const [rotation, setRotation] = createSignal(0);

	const storedMoves = () => {
		if (typeof window !== "undefined") {
			try {
				const stored = localStorage.getItem("chess_pending_move_comp");
				return stored ? JSON.parse(stored) : null;
			} catch (e) {
				console.error("Failed to parse pending move", e);
			}
		}
		return null;
	};

	const [pendingMove, setPendingMove] = createSignal<{
		from: number;
		to: number;
	} | null>(storedMoves());

	createEffect(() => {
		if (typeof window !== "undefined") {
			const move = pendingMove();
			if (move) {
				localStorage.setItem("chess_pending_move_comp", JSON.stringify(move));
			} else {
				localStorage.removeItem("chess_pending_move_comp");
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

	// Auto-start vs_computer if not in that mode
	createEffect(() => {
		if (boardQuery.data && boardQuery.data.mode !== "vs_computer") {
			handleReset({ mode: "vs_computer", timeControl: 10 });
		}
	});

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
		},
	}));

	const undoMutation = useMutation(() => ({
		mutationFn: () => undoMove(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["board"] });
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

	const pieces = createMemo(() => {
		const basePieces = boardQuery.data?.pieces || [];
		const pending = pendingMove();
		if (!pending) return basePieces;
		return basePieces
			.filter((p) => p.square !== pending.to)
			.map((p) => {
				if (p.square === pending.from) {
					return { ...p, square: pending.to };
				}
				return p;
			});
	});

	const turn = createMemo(() => boardQuery.data?.turn || "White");

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
		
		// In vs_computer, only allow player (White) to move
		if (turn() !== "White") return;

		if (pendingMove()) return;

		const currentPieces = pieces();
		const clickedPiece = currentPieces.find((p) => p.square === squareIndex);
		const selected = selectedSquare();

		if (clickedPiece && clickedPiece.color === "White") {
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
				setErrorMsg(`API Error: ${e?.message || "Unknown error"}`);
				setValidMoves([]);
			}
			return;
		}

		if (selected !== null) {
			if (validMoves().includes(squareIndex)) {
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
		resetMutation.mutate(opts || { mode: "vs_computer", timeControl: 10 });
	};

	return (
		<div class="min-h-screen bg-stone-100 font-sans text-stone-800 flex flex-col">
			<Header
				onRestart={handleReset}
				isRestarting={resetMutation.isPending}
				activeMode="vs_computer"
				currentTimeControl={boardQuery.data?.timeControl}
			/>

			<div class="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 overflow-hidden relative">
				<div class="flex flex-col xl:flex-row items-center justify-center gap-8 w-full max-w-[1800px]">
					{/* Black Panel (Computer) */}
					<div class="flex flex-col gap-6 w-full max-w-[300px] xl:h-[800px] xl:justify-center order-2 xl:order-1">
						<div class="bg-white p-6 rounded-2xl shadow-xl border border-stone-200 flex flex-col gap-4 items-center text-center relative overflow-hidden">
							<div class="w-20 h-20 bg-stone-800 rounded-2xl shadow-inner flex items-center justify-center text-stone-200 font-bold border-4 border-stone-600 text-3xl mb-2">
								🤖
							</div>
							<div>
								<div class="font-extrabold text-2xl leading-tight text-stone-900">
									Engine
								</div>
								<div class={`text-xs font-bold uppercase tracking-wider ${turn() === "Black" ? "text-emerald-600" : "text-stone-400"}`}>
									{turn() === "Black" ? "Thinking..." : "Waiting"}
								</div>
								<div class={`text-4xl font-mono font-bold mt-2 ${turn() === "Black" ? "text-stone-800" : "text-stone-300"}`}>
									{formatTime(blackTime())}
								</div>
							</div>
							<div class="flex flex-wrap justify-center gap-1 min-h-[40px] w-full bg-stone-50 rounded-lg p-2 border border-stone-100">
								<For each={boardQuery.data?.capturedPieces?.white}>
									{(p) => <span class="text-3xl filter drop-shadow-sm text-stone-800">{PIECE_SYMBOLS.White[p]}</span>}
								</For>
							</div>
						</div>
					</div>

					{/* Center: Board */}
					<div class="relative group order-1 xl:order-2">
						<div class="absolute -top-16 left-0 w-full flex justify-center h-12 pointer-events-none z-30">
							<Show when={errorMsg()}>
								<div class="bg-red-600 text-white px-8 py-3 rounded-full shadow-2xl text-base font-bold animate-bounce flex items-center gap-2 border-4 border-white/20">
									<span>⚠️</span> {errorMsg()}
								</div>
							</Show>
						</div>

						<div class="w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-stone-300 rounded-xl shadow-2xl overflow-hidden border-[16px] border-stone-800 relative select-none">
							<div class="grid grid-cols-8 grid-rows-[repeat(8,1fr)] w-full h-full">
								<For each={Array.from({ length: 64 })}>
									{(_, index) => {
										const squareIndex = index();
										const row = Math.floor(squareIndex / 8);
										const col = squareIndex % 8;
										const isBlack = (row + col) % 2 === 1;

										return (
											<button
												class={`relative w-full h-full flex items-center justify-center focus:outline-none transition-colors duration-200 ${isBlack ? "bg-[#b58863]" : "bg-[#f0d9b5]"}`}
												classList={{
													"ring-inset ring-[6px] ring-indigo-500/60 z-10": selectedSquare() === squareIndex,
												}}
												onClick={() => handleSquareClick(squareIndex)}
											>
												<Show when={validMoves().includes(squareIndex)}>
													<div class={getPieceAt(squareIndex) ? "absolute inset-0 border-[6px] border-rose-500/50 rounded-full m-1" : "w-4 h-4 bg-stone-900/20 rounded-full"} />
												</Show>
												{(() => {
													const piece = getPieceAt(squareIndex);
													return (
														<Show when={piece}>
															<span
																class="text-4xl sm:text-5xl md:text-7xl drop-shadow-2xl transition-all duration-700 ease-in-out cursor-pointer hover:scale-110 active:scale-90 transform-gpu z-20"
																style={{
																	color: piece!.color === "White" ? "#ffffff" : "#1a1a1a",
																	"text-shadow": piece!.color === "White" ? "0 2px 4px rgba(0,0,0,0.4)" : "0 2px 4px rgba(255,255,255,0.1)",
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

							<Show when={boardQuery.data?.status && boardQuery.data?.status !== "Ongoing"}>
								<div class="absolute inset-0 bg-stone-900/80 flex items-center justify-center z-50 backdrop-blur-md">
									<div class="bg-white p-12 rounded-3xl shadow-2xl text-center">
										<h2 class="text-6xl font-black text-stone-900 mb-4">{boardQuery.data?.status}</h2>
										<button onClick={() => handleReset()} class="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black text-xl">New Game</button>
									</div>
								</div>
							</Show>
						</div>
					</div>

					{/* White Panel (Player) */}
					<div class="flex flex-col gap-6 w-full max-w-[300px] xl:h-[800px] xl:justify-center order-3">
						<div class="bg-white p-6 rounded-2xl shadow-xl border border-stone-200 flex flex-col gap-4 items-center text-center relative overflow-hidden">
							<div class="w-20 h-20 bg-white border-4 border-stone-200 rounded-2xl shadow-md flex items-center justify-center text-stone-900 font-bold text-3xl mb-2">
								W
							</div>
							<div>
								<div class="font-extrabold text-2xl leading-tight text-stone-900">You</div>
								<div class={`text-xs font-bold uppercase tracking-wider ${turn() === "White" ? "text-emerald-600" : "text-stone-400"}`}>
									{turn() === "White" ? "Your Turn" : "Waiting"}
								</div>
								<div class={`text-4xl font-mono font-bold mt-2 ${turn() === "White" ? "text-stone-800" : "text-stone-300"}`}>
									{formatTime(whiteTime())}
								</div>
							</div>
							<div class="flex flex-wrap justify-center gap-1 min-h-[40px] w-full bg-stone-50 rounded-lg p-2 border border-stone-100">
								<For each={boardQuery.data?.capturedPieces?.black}>
									{(p) => <span class="text-3xl filter drop-shadow-sm text-stone-800">{PIECE_SYMBOLS.Black[p]}</span>}
								</For>
							</div>
							<Show when={turn() === "White" && pendingMove()}>
								<div class="flex gap-2 w-full mt-4">
									<button onClick={handleConfirmMove} class="flex-1 bg-emerald-500 text-white font-bold py-3 rounded-xl">Submit</button>
									<button onClick={handleCancelMove} class="flex-1 bg-stone-400 text-white font-bold py-3 rounded-xl">Cancel</button>
								</div>
							</Show>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}