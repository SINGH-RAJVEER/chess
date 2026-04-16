import type {
	BoardResponse,
	Color,
	PieceType,
	PromotionPiece,
	QueueStatusResponse,
} from "@chess/types";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
	getBoard,
	getMoves,
	getQueueStatus,
	joinQueue,
	makeMove,
	offerDraw,
	resignGame,
	respondToDraw,
	undoMove,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-context";
import { playSound, resumeAudioContext } from "@/lib/sounds";
import { calculateMaterialAdvantage } from "@/lib/themes";

type PendingMove = { from: number; to: number };

function buildCapturedPieceEntries(capturedPieces: PieceType[] | undefined) {
	const counts = new Map<PieceType, number>();
	return (capturedPieces ?? []).map((piece) => {
		const occurrence = (counts.get(piece) ?? 0) + 1;
		counts.set(piece, occurrence);
		return { key: `${piece}-${occurrence}`, piece };
	});
}

export default function OnlinePlayerPage() {
	const { user, isLoading: isAuthLoading } = useAuth();
	const navigate = useNavigate();
	const { settings } = useSettings();
	const [boardData, setBoardData] = useState<BoardResponse | null>(null);
	const [queueStatus, setQueueStatus] = useState<QueueStatusResponse>({ status: "idle" });
	const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
	const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
	const [validMoves, setValidMoves] = useState<number[]>([]);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [now, setNow] = useState(Date.now());
	const [isJoiningQueue, setIsJoiningQueue] = useState(false);
	const [isMovePending, setIsMovePending] = useState(false);
	const [promotionState, setPromotionState] = useState<{
		from: number;
		to: number;
		color: Color;
	} | null>(null);
	const prevMoveCountRef = useRef(0);

	const playerId = user?.id ?? "";

	useEffect(() => {
		if (!isAuthLoading && !user) navigate("/sign-in");
	}, [user, isAuthLoading, navigate]);

	const fetchBoard = useCallback(async () => {
		if (!playerId) return;
		try {
			setBoardData(await getBoard({ mode: "vs_player", playerId }));
		} catch (error) {
			console.error("Failed to fetch board:", error);
		}
	}, [playerId]);

	const fetchQueue = useCallback(async () => {
		if (!playerId) return;
		try {
			setQueueStatus(await getQueueStatus(playerId));
		} catch (error) {
			console.error("Failed to fetch queue:", error);
		}
	}, [playerId]);

	useEffect(() => {
		if (!playerId) return;
		void fetchBoard();
	}, [fetchBoard, playerId]);

	useEffect(() => {
		if (!playerId || !boardData || boardData.id === 0 || boardData.status !== "Ongoing") return;
		const id = window.setInterval(() => void fetchBoard(), 1000);
		return () => window.clearInterval(id);
	}, [fetchBoard, boardData?.id, boardData?.status, playerId]);

	useEffect(() => {
		if (!playerId || (boardData && boardData.id !== 0)) {
			setQueueStatus((c) => (c.status === "matched" ? c : { status: "idle" }));
			return;
		}
		void fetchQueue();
		const id = window.setInterval(() => void fetchQueue(), 1000);
		return () => window.clearInterval(id);
	}, [boardData, fetchQueue, playerId]);

	useEffect(() => {
		if (queueStatus.status === "matched") void fetchBoard();
	}, [fetchBoard, queueStatus.status]);

	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 100);
		return () => window.clearInterval(id);
	}, []);

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

	const pieces = useMemo(() => {
		const basePieces = boardData?.pieces ?? [];
		if (!pendingMove) return basePieces;
		return basePieces
			.filter((p) => p.square !== pendingMove.to)
			.map((p) => (p.square === pendingMove.from ? { ...p, square: pendingMove.to } : p));
	}, [boardData?.pieces, pendingMove]);

	const turn = boardData?.turn || "White";
	const userColor = boardData?.userColor || "Spectator";
	const opponentColor: Color = userColor === "Black" ? "White" : "Black";
	const isUserTurn = userColor !== "Spectator" && turn === userColor;
	const flipped = userColor === "Black";

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

	const opponentTime = userColor === "Black" ? whiteTime : blackTime;
	const userTime = userColor === "Black" ? blackTime : whiteTime;

	const capturedWhite = useMemo(
		() => buildCapturedPieceEntries(boardData?.capturedPieces?.white),
		[boardData?.capturedPieces?.white],
	);
	const capturedBlack = useMemo(
		() => buildCapturedPieceEntries(boardData?.capturedPieces?.black),
		[boardData?.capturedPieces?.black],
	);

	const opponentCaptured = userColor === "White" ? capturedWhite : capturedBlack;
	const userCaptured = userColor === "White" ? capturedBlack : capturedWhite;

	const materialAdv = useMemo(
		() => calculateMaterialAdvantage(boardData?.capturedPieces ?? { white: [], black: [] }),
		[boardData?.capturedPieces],
	);

	const userMaterialAdv =
		userColor === "White"
			? materialAdv > 0
				? materialAdv
				: 0
			: materialAdv < 0
				? Math.abs(materialAdv)
				: 0;
	const opponentMaterialAdv =
		userColor === "White"
			? materialAdv < 0
				? Math.abs(materialAdv)
				: 0
			: materialAdv > 0
				? materialAdv
				: 0;

	const formatTime = (ms: number) => {
		if (boardData?.timeControl === 0) return "\u221E";
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	};

	const handleSquareClick = async (squareIndex: number) => {
		resumeAudioContext();
		if (!boardData || boardData.id === 0 || boardData.status !== "Ongoing") return;
		if (userColor === "Spectator" || !isUserTurn || pendingMove) return;

		const clickedPiece = pieces.find((p) => p.square === squareIndex);

		if (clickedPiece && clickedPiece.color === userColor) {
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
				setErrorMsg(`API Error: ${error instanceof Error ? error.message : "Unknown"}`);
				setValidMoves([]);
			}
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
				setPromotionState({ from: selectedSquare, to: squareIndex, color: userColor as Color });
				setSelectedSquare(null);
				setValidMoves([]);
				return;
			}
			setPendingMove({ from: selectedSquare, to: squareIndex });
		}
		setSelectedSquare(null);
		setValidMoves([]);
	};

	const handleConfirmMove = async (promotion?: PromotionPiece) => {
		const move =
			pendingMove ?? (promotionState ? { from: promotionState.from, to: promotionState.to } : null);
		if (!move || !boardData?.id || isMovePending) return;
		try {
			setIsMovePending(true);
			await makeMove({ ...move, gameId: boardData.id, promotion });
			setPendingMove(null);
			setPromotionState(null);
			await fetchBoard();
		} catch (error) {
			setErrorMsg(`Move failed: ${error instanceof Error ? error.message : String(error)}`);
			setTimeout(() => setErrorMsg(null), 3000);
		} finally {
			setIsMovePending(false);
		}
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
			await undoMove({ gameId: boardData.id });
			await fetchBoard();
		} catch (error) {
			setErrorMsg(`Undo failed: ${error instanceof Error ? error.message : String(error)}`);
			setTimeout(() => setErrorMsg(null), 3000);
		}
	};

	const handleResign = async () => {
		if (!boardData?.id || userColor === "Spectator") return;
		await resignGame(boardData.id, userColor as Color);
		await fetchBoard();
	};

	const handleOfferDraw = async () => {
		if (!boardData?.id || userColor === "Spectator") return;
		await offerDraw(boardData.id, userColor as Color);
		await fetchBoard();
	};

	const handleAcceptDraw = async () => {
		if (!boardData?.id) return;
		await respondToDraw(boardData.id, true);
		await fetchBoard();
	};

	const handleDeclineDraw = async () => {
		if (!boardData?.id) return;
		await respondToDraw(boardData.id, false);
		await fetchBoard();
	};

	const handleFindMatch = async (options?: {
		mode: "vs_player" | "vs_computer";
		timeControl: number;
		increment?: number;
	}) => {
		if (!options) return;
		try {
			setIsJoiningQueue(true);
			setBoardData(null);
			setPendingMove(null);
			setSelectedSquare(null);
			setValidMoves([]);
			setErrorMsg(null);
			prevMoveCountRef.current = 0;
			const status = await joinQueue({
				playerId,
				timeControl: options.timeControl,
				increment: options.increment,
			});
			setQueueStatus(status);
			if (status.status === "matched") await fetchBoard();
			if (settings.soundEnabled) playSound("gameStart");
		} catch (error) {
			setErrorMsg(error instanceof Error ? error.message : "Failed to join queue");
		} finally {
			setIsJoiningQueue(false);
		}
	};

	const isGameOver = boardData !== null && boardData.status !== "Ongoing";
	const hasActiveGame = boardData !== null && boardData.id !== 0;

	const getGameOverMessage = () => {
		if (!boardData) return "";
		switch (boardData.status) {
			case "Checkmate": {
				const winner = boardData.turn === "White" ? "Black" : "White";
				return winner === userColor ? "You win by checkmate!" : `${winner} wins by checkmate`;
			}
			case "Timeout": {
				const winner = boardData.turn === "White" ? "Black" : "White";
				return winner === userColor ? "You win on time!" : `${winner} wins on time`;
			}
			case "Resignation": {
				const winner = boardData.turn === "White" ? "Black" : "White";
				return winner === userColor ? "Opponent resigned!" : "You resigned";
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

	return (
		<div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-300">
			<Header
				onRestart={handleFindMatch}
				isRestarting={isJoiningQueue}
				activeTab="vs_player_online"
				currentTimeControl={boardData?.timeControl}
				currentIncrement={boardData?.increment}
				queueStatus={queueStatus.status}
			/>

			<div className="relative flex flex-1 flex-col items-center justify-center p-4 lg:p-8">
				{errorMsg && (
					<div className="absolute top-4 z-30 rounded bg-red-900/80 px-4 py-1.5 text-xs font-medium text-red-100 backdrop-blur-sm flex items-center gap-2">
						<AlertCircle className="size-3" />
						{errorMsg}
					</div>
				)}

				<div className="flex w-full max-w-6xl flex-col items-center justify-center gap-6 lg:flex-row lg:gap-12">
					<div className="order-1 flex w-full max-w-[240px] flex-col gap-4">
						<PlayerCard
							label={hasActiveGame ? `Opponent (${opponentColor})` : "Opponent"}
							color={opponentColor}
							time={hasActiveGame ? formatTime(opponentTime) : "--:--"}
							isActive={!isUserTurn}
							capturedPieces={opponentCaptured}
							capturedByColor={userColor === "Spectator" ? "White" : (userColor as Color)}
							materialAdvantage={opponentMaterialAdv}
							showTime={boardData?.timeControl !== 0}
							isLowTime={opponentTime < 30000 && boardData?.timeControl !== 0}
						/>
					</div>

					<div className="order-2">
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

					<div className="order-3 flex w-full max-w-[240px] flex-col gap-4">
						<PlayerCard
							label={hasActiveGame && userColor !== "Spectator" ? `You (${userColor})` : "You"}
							color={userColor === "Spectator" ? "White" : (userColor as Color)}
							time={hasActiveGame ? formatTime(userTime) : "--:--"}
							isActive={isUserTurn}
							capturedPieces={userCaptured}
							capturedByColor={opponentColor}
							materialAdvantage={userMaterialAdv}
							showTime={boardData?.timeControl !== 0}
							isLowTime={userTime < 30000 && boardData?.timeControl !== 0}
						>
							{hasActiveGame && userColor !== "Spectator" && pendingMove && (
								<div className="flex gap-2">
									<Button
										size="sm"
										className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-white h-7 text-xs"
										onClick={() => void handleConfirmMove()}
									>
										Confirm
									</Button>
									<Button
										size="sm"
										variant="outline"
										className="flex-1 border-zinc-700 h-7 text-xs"
										onClick={handleCancelMove}
									>
										Cancel
									</Button>
								</div>
							)}
						</PlayerCard>

						{hasActiveGame && userColor !== "Spectator" && (
							<GameControls
								onResign={handleResign}
								onOfferDraw={handleOfferDraw}
								onAcceptDraw={handleAcceptDraw}
								onDeclineDraw={handleDeclineDraw}
								onTakeback={() => void handleUndo()}
								drawOfferedBy={boardData?.drawOfferedBy}
								userColor={userColor as Color}
								canTakeback={!isUserTurn && !pendingMove && (boardData?.moves.length ?? 0) > 0}
								isGameOngoing={boardData?.status === "Ongoing"}
							/>
						)}
					</div>
				</div>
			</div>

			<MoveHistory moves={boardData?.moves ?? []} />

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
								handleFindMatch({
									mode: "vs_player",
									timeControl: boardData?.timeControl || 10,
									increment: boardData?.increment,
								})
							}
						>
							Find New Match
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
