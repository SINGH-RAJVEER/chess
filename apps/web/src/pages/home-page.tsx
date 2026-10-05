import type { BoardResponse, Color, PromotionPiece, WsServerMessage } from "@sixtyfour/types";
import { AlertCircle, User, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChessBoard from "@/components/chess-board";
import GameControls from "@/components/game-controls";
import Header from "@/components/header";
import MoveHistory from "@/components/move-history";
import PlayerCard from "@/components/player-card";
import PromotionDialog from "@/components/promotion-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	buildCapturedPieceEntries,
	formatGameTime,
	getClockTime,
	getPreviewPieces,
	type PendingMove,
} from "@/lib/game-utils";
import { useSettings } from "@/lib/settings-context";
import { playSound, resumeAudioContext } from "@/lib/sounds";
import { calculateMaterialAdvantage } from "@/lib/themes";
import { gameSocket, type SocketStatus } from "@/lib/ws";

export default function HomePage() {
	const { settings } = useSettings();
	const [boardData, setBoardData] = useState<BoardResponse | null>(null);
	const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
	const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
	const [validMoves, setValidMoves] = useState<number[]>([]);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [now, setNow] = useState(Date.now());
	const [isMovePending, setIsMovePending] = useState(false);
	const [isResetPending, setIsResetPending] = useState(false);
	const [takebackRequestedBy, setTakebackRequestedBy] = useState<Color | null>(null);
	const [socketStatus, setSocketStatus] = useState<SocketStatus>(gameSocket.getStatus());
	const [promotionState, setPromotionState] = useState<{
		from: number;
		to: number;
		color: Color;
	} | null>(null);
	const prevMoveCountRef = useRef(0);
	const boardIdRef = useRef(0);

	const showError = useCallback((message: string) => {
		setErrorMsg(message);
		setTimeout(() => setErrorMsg(null), 3000);
	}, []);

	// Local play runs over the same socket as every other mode. Board pushes
	// replace the old 1s poll; anonymous boards need no session.
	useEffect(() => {
		let cancelled = false;
		let loading = false;
		const loadInitial = async () => {
			if (loading) return;
			loading = true;
			try {
				const board = await gameSocket.request({ type: "board.get", mode: "vs_player" });
				if (cancelled) return;
				if (board.type === "game.state") {
					if (board.board.id === 0) {
						const created = await gameSocket.request({
							type: "game.new",
							mode: "vs_player",
							timeControl: 10,
						});
						if (!cancelled && created.type === "game.state") setBoardData(created.board);
					} else {
						setBoardData(board.board);
						await gameSocket
							.request({ type: "game.join", gameId: board.board.id })
							.catch(() => undefined);
					}
				}
			} catch (error) {
				console.error("Failed to load local board over socket:", error);
			} finally {
				loading = false;
			}
		};

		gameSocket.connect();
		const offStatus = gameSocket.onStatus(setSocketStatus);
		const offMessages = gameSocket.subscribe((msg: WsServerMessage) => {
			if (msg.type === "game.state" && msg.board.mode === "vs_player") {
				setBoardData(msg.board);
			}
		});

		void loadInitial();

		const offReconnect = gameSocket.onStatus((status) => {
			if (status !== "open" || cancelled) return;
			if (boardIdRef.current !== 0) {
				gameSocket
					.request({ type: "game.join", gameId: boardIdRef.current })
					.catch(() => undefined);
			} else {
				// The first load failed (e.g. the server was unreachable);
				// retry now that the socket is back.
				void loadInitial();
			}
		});

		return () => {
			cancelled = true;
			offStatus();
			offMessages();
			offReconnect();
			gameSocket.disconnect();
		};
	}, []);

	useEffect(() => {
		boardIdRef.current = boardData?.id ?? 0;
	}, [boardData?.id]);

	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 100);
		return () => window.clearInterval(id);
	}, []);

	// Play sounds on new moves
	useEffect(() => {
		if (!boardData || !settings.soundEnabled) return;
		const moveCount = boardData.moves.length;
		if (moveCount > prevMoveCountRef.current && prevMoveCountRef.current > 0) {
			const lastMove = boardData.moves[moveCount - 1];
			if (boardData.status === "Checkmate") {
				playSound("gameEnd");
			} else if (boardData.isCheck) {
				playSound("check");
			} else if (lastMove?.captured) {
				playSound("capture");
			} else if (lastMove?.isCastle) {
				playSound("castle");
			} else if (lastMove?.promotion) {
				playSound("promote");
			} else {
				playSound("move");
			}
		}
		prevMoveCountRef.current = moveCount;
	}, [boardData, settings.soundEnabled]);

	const pieces = useMemo(
		() => getPreviewPieces(boardData?.pieces, pendingMove),
		[boardData?.pieces, pendingMove],
	);

	const turn = boardData?.turn || "White";
	const responderColor = useMemo<Color | null>(() => {
		const requester = takebackRequestedBy ?? boardData?.drawOfferedBy ?? null;
		if (!requester) return null;
		return requester === "White" ? "Black" : "White";
	}, [boardData?.drawOfferedBy, takebackRequestedBy]);

	const whiteTime = useMemo(() => getClockTime(boardData, "White", now), [boardData, now]);
	const blackTime = useMemo(() => getClockTime(boardData, "Black", now), [boardData, now]);

	const capturedWhite = useMemo(
		() => buildCapturedPieceEntries(boardData?.capturedPieces?.white),
		[boardData?.capturedPieces?.white],
	);
	const capturedBlack = useMemo(
		() => buildCapturedPieceEntries(boardData?.capturedPieces?.black),
		[boardData?.capturedPieces?.black],
	);

	const materialAdv = useMemo(
		() => calculateMaterialAdvantage(boardData?.capturedPieces ?? { white: [], black: [] }),
		[boardData?.capturedPieces],
	);

	const handleSquareClick = async (squareIndex: number) => {
		resumeAudioContext();
		if (takebackRequestedBy || boardData?.drawOfferedBy) return;
		if (boardData?.status !== "Ongoing" || pendingMove) return;

		const clickedPiece = pieces.find((p) => p.square === squareIndex);

		if (clickedPiece && clickedPiece.color === boardData.turn) {
			if (selectedSquare === squareIndex) {
				setSelectedSquare(null);
				setValidMoves([]);
				return;
			}
			setSelectedSquare(squareIndex);
			setErrorMsg(null);
			setValidMoves(boardData.legalMoves?.[squareIndex] ?? []);
			return;
		}

		if (selectedSquare !== null && validMoves.includes(squareIndex)) {
			const movingPiece = pieces.find((p) => p.square === selectedSquare);
			const destRow = Math.floor(squareIndex / 8);
			const isPromotion =
				movingPiece?.piece_type === "Pawn" &&
				((movingPiece.color === "White" && destRow === 0) ||
					(movingPiece.color === "Black" && destRow === 7));

			if (isPromotion && !settings.autoQueen) {
				setPromotionState({
					from: selectedSquare,
					to: squareIndex,
					color: movingPiece.color,
				});
				setSelectedSquare(null);
				setValidMoves([]);
				return;
			}

			const move = { from: selectedSquare, to: squareIndex };
			if (settings.confirmMoves) {
				setPendingMove(move);
			} else {
				void submitMove(move);
			}
		}
		setSelectedSquare(null);
		setValidMoves([]);
	};

	const submitMove = async (move: PendingMove, promotion?: PromotionPiece) => {
		if (!boardData?.id || isMovePending) return;

		try {
			setIsMovePending(true);
			await gameSocket.request({ ...move, gameId: boardData.id, promotion, type: "game.move" });
			setPendingMove(null);
			setPromotionState(null);
			setTakebackRequestedBy(null);
		} catch (error) {
			showError(`Move failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setIsMovePending(false);
		}
	};

	const handleConfirmMove = async (promotion?: PromotionPiece) => {
		const move =
			pendingMove ?? (promotionState ? { from: promotionState.from, to: promotionState.to } : null);
		if (!move) return;
		await submitMove(move, promotion);
	};

	const handlePromotionSelect = (piece: PromotionPiece) => {
		if (!promotionState) return;
		setPendingMove({ from: promotionState.from, to: promotionState.to });
		void handleConfirmMove(piece);
	};

	const handleCancelMove = () => {
		setPendingMove(null);
		setPromotionState(null);
	};

	const handleUndo = async () => {
		if (!boardData?.id) return;
		try {
			await gameSocket.request({ type: "game.undo.request", gameId: boardData.id });
			setTakebackRequestedBy(null);
		} catch (error) {
			showError(`Undo failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleResign = async () => {
		if (!boardData?.id) return;
		try {
			await gameSocket.request({ type: "game.resign", gameId: boardData.id });
		} catch (error) {
			showError(`Resign failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleOfferDraw = async () => {
		if (!boardData?.id) return;
		setSelectedSquare(null);
		setValidMoves([]);
		setPendingMove(null);
		try {
			await gameSocket.request({ type: "game.draw.offer", gameId: boardData.id });
		} catch (error) {
			showError(`Draw offer failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleAcceptDraw = async () => {
		if (!boardData?.id) return;
		try {
			await gameSocket.request({ type: "game.draw.respond", gameId: boardData.id, accept: true });
		} catch (error) {
			showError(`Draw response failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleDeclineDraw = async () => {
		if (!boardData?.id) return;
		try {
			await gameSocket.request({ type: "game.draw.respond", gameId: boardData.id, accept: false });
		} catch (error) {
			showError(`Draw response failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleRequestTakeback = () => {
		setSelectedSquare(null);
		setValidMoves([]);
		setPendingMove(null);
		setPromotionState(null);
		setTakebackRequestedBy(turn);
	};

	const handleDeclineTakeback = () => {
		setTakebackRequestedBy(null);
	};

	const handleReset = async (options?: {
		mode: "vs_player" | "vs_computer";
		timeControl: number;
		increment?: number;
	}) => {
		if (!options) return;
		try {
			setIsResetPending(true);
			const created = await gameSocket.request({
				type: "game.new",
				mode: options.mode,
				timeControl: options.timeControl,
				increment: options.increment,
			});
			if (created.type === "game.state") setBoardData(created.board);
			setSelectedSquare(null);
			setValidMoves([]);
			setPendingMove(null);
			setTakebackRequestedBy(null);
			setErrorMsg(null);
			prevMoveCountRef.current = 0;
			if (settings.soundEnabled) playSound("gameStart");
		} catch (error) {
			showError(`Reset failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setIsResetPending(false);
		}
	};

	const isGameOver = boardData !== null && boardData.status !== "Ongoing";

	const getGameOverMessage = () => {
		if (!boardData) return "";
		switch (boardData.status) {
			case "Checkmate": {
				const winner = boardData.turn === "White" ? "Black" : "White";
				return `${winner} wins by checkmate`;
			}
			case "Timeout": {
				const winner = boardData.turn === "White" ? "Black" : "White";
				return `${winner} wins on time`;
			}
			case "Resignation": {
				const winner = boardData.turn === "White" ? "Black" : "White";
				return `${winner} wins by resignation`;
			}
			case "Stalemate":
				return "Draw by stalemate";
			case "Draw":
				return "Draw by agreement";
			case "InsufficientMaterial":
				return "Draw by insufficient material";
			case "ThreefoldRepetition":
				return "Draw by threefold repetition";
			case "FiftyMoveRule":
				return "Draw by fifty-move rule";
			default:
				return "";
		}
	};

	const perspectiveColor = responderColor ?? turn;
	const flipped = perspectiveColor === "Black";
	const topColor: Color = flipped ? "White" : "Black";
	const bottomColor: Color = flipped ? "Black" : "White";

	return (
		<div className="h-screen flex flex-col bg-zinc-950 font-sans text-zinc-300 overflow-hidden">
			<Header
				onRestart={handleReset}
				isRestarting={isResetPending}
				activeTab="vs_player"
				currentTimeControl={boardData?.timeControl}
				currentIncrement={boardData?.increment}
			/>

			<div className="flex-1 min-h-0 flex flex-col overflow-hidden md:flex-row">
				<div className="flex-1 min-h-0 flex flex-col p-4 gap-3 relative">
					{errorMsg && (
						<div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 rounded bg-red-900/80 px-4 py-1.5 text-xs font-medium text-red-100 backdrop-blur-sm flex items-center gap-2">
							<AlertCircle className="size-3" />
							{errorMsg}
						</div>
					)}
					{socketStatus !== "open" && (
						<div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 rounded bg-zinc-800/90 px-4 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-sm flex items-center gap-2">
							<WifiOff className="size-3" />
							Reconnecting…
						</div>
					)}

					<PlayerCard
						label={topColor}
						color={topColor}
						time={formatGameTime(
							topColor === "White" ? whiteTime : blackTime,
							boardData?.timeControl !== 0,
						)}
						isActive={turn === topColor}
						capturedPieces={topColor === "White" ? capturedBlack : capturedWhite}
						capturedByColor={topColor === "White" ? "Black" : "White"}
						materialAdvantage={
							topColor === "White"
								? materialAdv > 0
									? materialAdv
									: 0
								: materialAdv < 0
									? Math.abs(materialAdv)
									: 0
						}
						showTime={boardData?.timeControl !== 0}
						isLowTime={
							(topColor === "White" ? whiteTime : blackTime) < 30000 && boardData?.timeControl !== 0
						}
						icon={
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-zinc-950 text-zinc-100 border border-zinc-800">
								<User className="size-4" />
							</div>
						}
					/>

					<div className="chess-board-area flex-1 min-h-0 flex items-center justify-center">
						<div className="chess-board-shell">
							<ChessBoard
								pieces={pieces}
								boardData={boardData}
								selectedSquare={selectedSquare}
								validMoves={validMoves}
								flipped={flipped}
								isCheck={boardData?.isCheck}
								onSquareClick={(sq) => void handleSquareClick(sq)}
							/>
						</div>
					</div>

					<PlayerCard
						label={bottomColor}
						color={bottomColor}
						time={formatGameTime(
							bottomColor === "White" ? whiteTime : blackTime,
							boardData?.timeControl !== 0,
						)}
						isActive={turn === bottomColor}
						capturedPieces={bottomColor === "White" ? capturedBlack : capturedWhite}
						capturedByColor={bottomColor === "White" ? "Black" : "White"}
						materialAdvantage={
							bottomColor === "White"
								? materialAdv > 0
									? materialAdv
									: 0
								: materialAdv < 0
									? Math.abs(materialAdv)
									: 0
						}
						showTime={boardData?.timeControl !== 0}
						isLowTime={
							(bottomColor === "White" ? whiteTime : blackTime) < 30000 &&
							boardData?.timeControl !== 0
						}
						icon={
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-zinc-100 text-zinc-900 border border-zinc-200">
								<User className="size-4" />
							</div>
						}
					/>
				</div>

				<div className="h-44 w-full shrink-0 flex flex-col border-t border-zinc-800 md:h-auto md:w-72 md:border-t-0 md:border-l">
					<MoveHistory moves={boardData?.moves ?? []} />

					<div className="shrink-0 border-t border-zinc-800 p-4 flex flex-col gap-2">
						{pendingMove && (
							<div className="flex gap-2">
								<Button
									className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-white"
									disabled={isMovePending}
									onClick={() => void handleConfirmMove()}
								>
									Confirm
								</Button>
								<Button
									variant="outline"
									className="flex-1 border-zinc-700"
									disabled={isMovePending}
									onClick={handleCancelMove}
								>
									Cancel
								</Button>
							</div>
						)}
						<GameControls
							onResign={handleResign}
							onOfferDraw={handleOfferDraw}
							onAcceptDraw={handleAcceptDraw}
							onDeclineDraw={handleDeclineDraw}
							onTakeback={handleRequestTakeback}
							onAcceptTakeback={() => void handleUndo()}
							onDeclineTakeback={handleDeclineTakeback}
							drawOfferedBy={boardData?.drawOfferedBy}
							takebackRequestedBy={takebackRequestedBy}
							userColor={bottomColor}
							canTakeback={
								!pendingMove &&
								!takebackRequestedBy &&
								!boardData?.drawOfferedBy &&
								(boardData?.moves.length ?? 0) > 0
							}
							isGameOngoing={boardData?.status === "Ongoing"}
						/>
					</div>
				</div>
			</div>

			{promotionState && (
				<PromotionDialog
					color={promotionState.color}
					onSelect={handlePromotionSelect}
					onCancel={handleCancelMove}
				/>
			)}

			<Dialog open={isGameOver} onOpenChange={() => {}}>
				<DialogContent
					className="bg-zinc-900 border-zinc-800 text-zinc-100"
					showCloseButton={false}
				>
					<DialogHeader>
						<DialogTitle className="text-3xl font-light text-center lowercase">
							{boardData?.status === "Checkmate"
								? "Checkmate"
								: boardData?.status === "Timeout"
									? "Time Out"
									: boardData?.status === "Resignation"
										? "Resigned"
										: "Game Over"}
						</DialogTitle>
						<DialogDescription className="text-center text-zinc-400 pt-2">
							{getGameOverMessage()}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="sm:justify-center mt-6">
						<Button
							className="bg-zinc-100 text-zinc-900 hover:bg-white px-8"
							onClick={() =>
								handleReset({
									mode: "vs_player",
									timeControl: boardData?.timeControl || 10,
									increment: boardData?.increment,
								})
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
