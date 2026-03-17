import type { BoardResponse, Color, PieceType } from "@chess/types";
import { AlertCircle, Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import Header from "../components/header";
import {
	getBoard,
	getMoves,
	makeMove,
	resetGame,
	undoMove,
} from "../lib/api";

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
		Pawn: "♙",
		Knight: "♘",
		Bishop: "♗",
		Rook: "♖",
		Queen: "♕",
		King: "♔",
	},
};

const BOARD_SQUARES = Array.from({ length: 64 }, (_, index) => index);

type PendingMove = {
	from: number;
	to: number;
};

function buildCapturedPieceEntries(capturedPieces: PieceType[] | undefined) {
	const counts = new Map<PieceType, number>();

	return (capturedPieces ?? []).map((piece) => {
		const occurrence = (counts.get(piece) ?? 0) + 1;
		counts.set(piece, occurrence);

		return {
			key: `${piece}-${occurrence}`,
			piece,
		};
	});
}

export default function HomePage() {
	const [boardData, setBoardData] = useState<BoardResponse | null>(null);
	const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
	const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
	const [validMoves, setValidMoves] = useState<number[]>([]);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [now, setNow] = useState(Date.now());
	const [isMovePending, setIsMovePending] = useState(false);
	const [isUndoPending, setIsUndoPending] = useState(false);
	const [isResetPending, setIsResetPending] = useState(false);

	useEffect(() => {
		try {
			const stored = localStorage.getItem("chess_pending_move");
			setPendingMove(stored ? (JSON.parse(stored) as PendingMove) : null);
		} catch (error) {
			console.error("Failed to parse pending move", error);
		}
	}, []);

	useEffect(() => {
		if (pendingMove) {
			localStorage.setItem("chess_pending_move", JSON.stringify(pendingMove));
			return;
		}
		localStorage.removeItem("chess_pending_move");
	}, [pendingMove]);

	const fetchBoard = useCallback(async () => {
		try {
			setBoardData(await getBoard({ mode: "vs_player" }));
		} catch (error) {
			console.error("Failed to fetch board:", error);
		}
	}, []);

	useEffect(() => {
		void fetchBoard();
		const intervalId = window.setInterval(() => {
			void fetchBoard();
		}, 1000);

		return () => window.clearInterval(intervalId);
	}, [fetchBoard]);

	useEffect(() => {
		const intervalId = window.setInterval(() => {
			setNow(Date.now());
		}, 100);

		return () => window.clearInterval(intervalId);
	}, []);

	const pieces = useMemo(() => {
		const basePieces = boardData?.pieces ?? [];
		if (!pendingMove) return basePieces;
		return basePieces
			.filter((piece) => piece.square !== pendingMove.to)
			.map((piece) =>
				piece.square === pendingMove.from ? { ...piece, square: pendingMove.to } : piece,
			);
	}, [boardData?.pieces, pendingMove]);

	const turn = boardData?.turn || "White";
	const rotation = 0;

	const whiteTime = useMemo(() => {
		if (!boardData) return 0;
		if (boardData.timeControl === 0) return Number.MAX_SAFE_INTEGER;
		if (boardData.turn === "White" && boardData.status === "Ongoing" && boardData.lastMoveTime) {
			return Math.max(0, boardData.whiteTimeRemaining - (now - boardData.lastMoveTime));
		}
		return boardData.whiteTimeRemaining;
	}, [boardData, now]);

	const blackTime = useMemo(() => {
		if (!boardData) return 0;
		if (boardData.timeControl === 0) return Number.MAX_SAFE_INTEGER;
		if (boardData.turn === "Black" && boardData.status === "Ongoing" && boardData.lastMoveTime) {
			return Math.max(0, boardData.blackTimeRemaining - (now - boardData.lastMoveTime));
		}
		return boardData.blackTimeRemaining;
	}, [boardData, now]);

	const capturedWhitePieces = useMemo(
		() => buildCapturedPieceEntries(boardData?.capturedPieces?.white),
		[boardData?.capturedPieces?.white],
	);
	const capturedBlackPieces = useMemo(
		() => buildCapturedPieceEntries(boardData?.capturedPieces?.black),
		[boardData?.capturedPieces?.black],
	);
	const moveHistory = useMemo(() => {
		const moves = boardData?.moves ?? [];
		return Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => {
			const moveIndex = index * 2;
			return {
				key: `${moveIndex}-${moves[moveIndex]?.notation ?? "start"}-${moves[moveIndex + 1]?.notation ?? "pending"}`,
				moveNumber: index + 1,
				whiteMove: moves[moveIndex],
				blackMove: moves[moveIndex + 1],
			};
		});
	}, [boardData?.moves]);

	const formatTime = (ms: number) => {
		if (boardData?.timeControl === 0) return "∞";
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	};

	const getPieceAt = (squareIndex: number) => pieces.find((piece) => piece.square === squareIndex);

	const handleSquareClick = async (squareIndex: number) => {
		if (!boardData) return;
		if (boardData.status !== "Ongoing") return;
		if (pendingMove) return;

		const clickedPiece = pieces.find((piece) => piece.square === squareIndex);

		if (clickedPiece && clickedPiece.color === boardData.turn) {
			if (selectedSquare === squareIndex) {
				setSelectedSquare(null);
				setValidMoves([]);
				return;
			}

			setSelectedSquare(squareIndex);
			setErrorMsg(null);

			try {
				setValidMoves(await getMoves({ square: squareIndex, gameId: boardData.id }));
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				setErrorMsg(`API Error: ${message}`);
				setValidMoves([]);
			}
			return;
		}

		if (selectedSquare !== null) {
			if (validMoves.includes(squareIndex)) {
				setPendingMove({ from: selectedSquare, to: squareIndex });
			}
			setSelectedSquare(null);
			setValidMoves([]);
		}
	};

	const handleConfirmMove = async () => {
		if (!pendingMove || !boardData?.id || isMovePending) return;

		try {
			setIsMovePending(true);
			await makeMove({ ...pendingMove, gameId: boardData.id });
			setPendingMove(null);
			await fetchBoard();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setErrorMsg(`Move failed: ${message}`);
			setTimeout(() => setErrorMsg(null), 3000);
		} finally {
			setIsMovePending(false);
		}
	};

	const handleCancelMove = () => {
		setPendingMove(null);
	};

	const handleUndo = async () => {
		if (!boardData?.id || isUndoPending) return;

		try {
			setIsUndoPending(true);
			await undoMove({ gameId: boardData.id });
			await fetchBoard();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setErrorMsg(`Undo failed: ${message}`);
			setTimeout(() => setErrorMsg(null), 3000);
		} finally {
			setIsUndoPending(false);
		}
	};

	const handleReset = async (options?: {
		mode: "vs_player" | "vs_computer";
		timeControl: number;
	}) => {
		if (!options) return;

		try {
			setIsResetPending(true);
			await resetGame(options);
			setSelectedSquare(null);
			setValidMoves([]);
			setPendingMove(null);
			setErrorMsg(null);
			await fetchBoard();
		} catch (error) {
			setErrorMsg(
				`Failed to reset game: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsResetPending(false);
		}
	};

	const isGameOver = boardData?.status && boardData.status !== "Ongoing";

	return (
		<div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-300">
			<Header
				onRestart={handleReset}
				isRestarting={isResetPending}
				activeTab="vs_player"
				currentTimeControl={boardData?.timeControl}
			/>

			<div className="relative flex flex-1 flex-col items-center justify-center p-4 lg:p-8">
				<div className="flex w-full max-w-6xl flex-col items-center justify-center gap-12 lg:flex-row">
					{/* Black Player Card */}
					<div className="order-2 flex w-full max-w-[240px] flex-col gap-8 lg:order-1">
						<Card
							className={cn(
								"bg-zinc-900 border-zinc-800 transition-opacity",
								turn === "White" ? "opacity-40" : "opacity-100",
							)}
						>
							<CardContent className="p-4 flex flex-col gap-4">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-950 text-lg font-bold text-zinc-100 border border-zinc-800">
										B
									</div>
									<div className="flex flex-col">
										<span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
											Black
										</span>
										<span className="text-xl font-mono font-light text-zinc-100">
											{formatTime(blackTime)}
										</span>
									</div>
								</div>

								<div className="flex flex-wrap gap-1 min-h-[24px]">
									{capturedWhitePieces.map(({ key, piece }) => (
										<span key={key} className="text-xl text-zinc-500">
											{PIECE_SYMBOLS.White[piece]}
										</span>
									))}
								</div>

								{turn === "Black" && pendingMove && (
									<div className="flex gap-2">
										<Button
											size="sm"
											className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-white h-8"
											onClick={() => void handleConfirmMove()}
										>
											<Check className="size-3 mr-1" />
											Confirm
										</Button>
										<Button
											size="sm"
											variant="outline"
											className="flex-1 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 h-8"
											onClick={handleCancelMove}
										>
											<X className="size-3 mr-1" />
											Cancel
										</Button>
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					{/* Chess Board */}
					<div className="relative order-1 lg:order-2">
						<div className="pointer-events-none absolute -top-12 left-0 z-30 flex w-full justify-center">
							{errorMsg && (
								<div className="rounded bg-red-900/80 px-4 py-1.5 text-xs font-medium text-red-100 backdrop-blur-sm flex items-center gap-2">
									<AlertCircle className="size-3" />
									{errorMsg}
								</div>
							)}
						</div>

						<div className="relative aspect-square w-[90vw] max-w-[600px] overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900 shadow-2xl select-none ring-1 ring-zinc-800">
							<div
								className="grid h-full w-full grid-cols-8 grid-rows-[repeat(8,1fr)]"
								style={{ transform: `rotate(${rotation}deg)` }}
							>
								{BOARD_SQUARES.map((squareIndex) => {
									const row = Math.floor(squareIndex / 8);
									const col = squareIndex % 8;
									const isBlackSquare = (row + col) % 2 === 1;
									const piece = getPieceAt(squareIndex);
									const lastMove = boardData?.lastMove;
									const isLastMove = lastMove?.from === squareIndex || lastMove?.to === squareIndex;
									const labelRotation = 0;

									return (
										<button
											key={squareIndex}
											type="button"
											className={cn(
												"relative flex items-center justify-center transition-colors duration-150 focus:outline-none",
												isBlackSquare ? "bg-zinc-800" : "bg-zinc-200",
												selectedSquare === squareIndex
													? "bg-indigo-500/40"
													: "hover:brightness-110",
											)}
											onClick={() => void handleSquareClick(squareIndex)}
										>
											{isLastMove && selectedSquare !== squareIndex && (
												<div className="absolute inset-0 bg-yellow-500/10" />
											)}

											{validMoves.includes(squareIndex) && (
												<div
													className={cn(
														"h-3 w-3 rounded-full",
														piece ? "border-2 border-zinc-400" : "bg-zinc-400/40",
													)}
												/>
											)}

											{piece && (
												<span
													className="z-20 text-4xl sm:text-5xl md:text-6xl select-none pointer-events-none"
													style={{
														transform: `rotate(${labelRotation}deg)`,
														color: piece.color === "White" ? "#fff" : "#000",
														filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
													}}
												>
													{PIECE_SYMBOLS[piece.color][piece.piece_type]}
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>
					</div>

					{/* White Player Card */}
					<div className="order-3 flex w-full max-w-[240px] flex-col gap-8">
						<Card
							className={cn(
								"bg-zinc-900 border-zinc-800 transition-opacity",
								turn === "Black" ? "opacity-40" : "opacity-100",
							)}
						>
							<CardContent className="p-4 flex flex-col gap-4">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-100 text-lg font-bold text-zinc-900 border border-zinc-200">
										W
									</div>
									<div className="flex flex-col">
										<span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
											White
										</span>
										<span className="text-xl font-mono font-light text-zinc-100">
											{formatTime(whiteTime)}
										</span>
									</div>
								</div>

								<div className="flex flex-wrap gap-1 min-h-[24px]">
									{capturedBlackPieces.map(({ key, piece }) => (
										<span key={key} className="text-xl text-zinc-500">
											{PIECE_SYMBOLS.Black[piece]}
										</span>
									))}
								</div>

								<div className="flex flex-col gap-2 mt-2">
								{turn === "Black" && (
										<Button
											size="sm"
											variant="ghost"
											className="w-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 h-8"
											onClick={() => void handleUndo()}
											disabled={isUndoPending || (boardData?.moves.length || 0) === 0}
										>
											<RotateCcw className="size-3 mr-2" />
											Takeback
										</Button>
									)}

									{turn === "White" && pendingMove && (
										<div className="flex gap-2">
											<Button
												size="sm"
												className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-white h-8"
												onClick={() => void handleConfirmMove()}
											>
												<Check className="size-3 mr-1" />
												Confirm
											</Button>
											<Button
												size="sm"
												variant="outline"
												className="flex-1 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 h-8"
												onClick={handleCancelMove}
											>
												<X className="size-3 mr-1" />
												Cancel
											</Button>
										</div>
									)}
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>

			{/* History Section */}
			<div className="border-t border-zinc-900 bg-zinc-950 p-4">
				<div className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto no-scrollbar">
					<span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
						History
					</span>
					<div className="flex gap-4">
						{moveHistory.map(({ key, moveNumber, whiteMove, blackMove }) => (
							<div key={key} className="flex gap-2 text-xs font-mono">
								<span className="text-zinc-700">{moveNumber}.</span>
								<span className="text-zinc-300">{whiteMove?.notation}</span>
								<span className="text-zinc-300">{blackMove?.notation}</span>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Game Over Dialog */}
			<Dialog open={isGameOver} onOpenChange={() => {}}>
				<DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
					<DialogHeader>
						<DialogTitle className="text-3xl font-light text-center lowercase">
							{boardData?.status}
						</DialogTitle>
						<DialogDescription className="text-center text-zinc-400 pt-2">
							{(() => {
								if (boardData?.status === "Stalemate") return "Draw";
								const winner = boardData?.turn === "White" ? "Black" : "White";
								return `${winner} wins by ${boardData?.status === "Timeout" ? "time" : "checkmate"}`;
							})()}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="sm:justify-center mt-6">
						<Button
							className="bg-zinc-100 text-zinc-900 hover:bg-white px-8"
							onClick={() =>
								handleReset({ mode: "vs_player", timeControl: boardData?.timeControl || 10 })
							}
						>
							Play Again
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
