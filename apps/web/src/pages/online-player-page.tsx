import type {
	BoardResponse,
	Color,
	PromotionPiece,
	QueueStatusResponse,
	WsServerMessage,
} from "@chess/types";
import { AlertCircle, WifiOff } from "lucide-react";
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
import { useAuth } from "@/lib/auth-context";
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
	const [takebackRequest, setTakebackRequest] = useState<{ by: Color } | null>(null);
	const [takebackSent, setTakebackSent] = useState(false);
	const [rematchOffer, setRematchOffer] = useState<{ by: Color } | null>(null);
	const [presence, setPresence] = useState<{ whiteOnline: boolean; blackOnline: boolean } | null>(
		null,
	);
	const [socketStatus, setSocketStatus] = useState<SocketStatus>(gameSocket.getStatus());
	const [promotionState, setPromotionState] = useState<{
		from: number;
		to: number;
		color: Color;
	} | null>(null);
	const prevMoveCountRef = useRef(0);
	const boardIdRef = useRef(0);

	const playerId = user?.id ?? "";
	const boardId = boardData?.id ?? 0;
	boardIdRef.current = boardId;

	useEffect(() => {
		if (!isAuthLoading && !user) navigate("/sign-in");
	}, [user, isAuthLoading, navigate]);

	const showError = useCallback((message: string) => {
		setErrorMsg(message);
		setTimeout(() => setErrorMsg(null), 3000);
	}, []);

	// Live socket: pushes replace the old 1s board/queue polling loops.
	useEffect(() => {
		if (!playerId) return;
		gameSocket.connect();
		const offStatus = gameSocket.onStatus(setSocketStatus);

		const offMessages = gameSocket.subscribe((msg: WsServerMessage) => {
			switch (msg.type) {
				case "game.state":
					setBoardData(msg.board);
					setTakebackSent(false);
					if (msg.board.drawOfferedBy == null) {
						// Draw offer resolved by the push; nothing extra to clear.
					}
					break;
				case "queue.status":
					setQueueStatus({ status: msg.status, gameId: msg.gameId, timeControl: msg.timeControl });
					setIsJoiningQueue(false);
					break;
				case "game.matched":
					setQueueStatus({ status: "matched", gameId: msg.gameId });
					setIsJoiningQueue(false);
					setRematchOffer(null);
					setTakebackRequest(null);
					setTakebackSent(false);
					prevMoveCountRef.current = 0;
					if (settings.soundEnabled) playSound("gameStart");
					break;
				case "presence":
					setPresence({ whiteOnline: msg.whiteOnline, blackOnline: msg.blackOnline });
					break;
				case "game.draw.offered":
					break;
				case "game.undo.requested":
					setTakebackRequest({ by: msg.by });
					break;
				case "game.undo.result":
					if (!msg.accepted) showError("Takeback declined");
					setTakebackSent(false);
					break;
				case "game.rematch.offered":
					setRematchOffer({ by: msg.by });
					break;
				case "game.over":
					break;
				case "error":
					break;
			}
		});

		// Initial load over the socket: latest game or matchmaking state.
		void (async () => {
			try {
				const board = await gameSocket.request({ type: "board.get", mode: "vs_player" });
				if (board.type === "game.state") {
					setBoardData(board.board);
					if (board.board.id !== 0) {
						await gameSocket
							.request({ type: "game.join", gameId: board.board.id })
							.catch(() => undefined);
					} else {
						const queue = await gameSocket.request({ type: "queue.get" });
						if (queue.type === "queue.status") {
							setQueueStatus({
								status: queue.status,
								gameId: queue.gameId,
								timeControl: queue.timeControl,
							});
						}
					}
				}
			} catch (error) {
				console.error("Failed to load board over socket:", error);
			}
		})();

		// Resume the room after a reconnect.
		const offReconnect = gameSocket.onStatus((status) => {
			if (status === "open" && boardIdRef.current !== 0) {
				gameSocket
					.request({ type: "game.join", gameId: boardIdRef.current })
					.catch(() => undefined);
			}
		});

		return () => {
			offStatus();
			offMessages();
			offReconnect();
			gameSocket.disconnect();
		};
	}, [playerId, settings.soundEnabled, showError]);

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

	const pieces = useMemo(
		() => getPreviewPieces(boardData?.pieces, pendingMove),
		[boardData?.pieces, pendingMove],
	);

	const turn = boardData?.turn || "White";
	const userColor = boardData?.userColor || "Spectator";
	const opponentColor: Color = userColor === "Black" ? "White" : "Black";
	const isUserTurn = userColor !== "Spectator" && turn === userColor;
	const flipped = userColor === "Black";

	const whiteTime = useMemo(() => getClockTime(boardData, "White", now), [boardData, now]);
	const blackTime = useMemo(() => getClockTime(boardData, "Black", now), [boardData, now]);

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

	const opponentOnline = userColor === "White" ? presence?.blackOnline : presence?.whiteOnline;

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
				const result = await gameSocket.request({
					type: "moves.get",
					gameId: boardData.id,
					square: squareIndex,
				});
				if (result.type === "moves.result") setValidMoves(result.targets);
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

	const handleTakebackRequest = async () => {
		if (!boardData?.id || takebackSent) return;
		try {
			await gameSocket.request({ type: "game.undo.request", gameId: boardData.id });
			setTakebackSent(true);
		} catch (error) {
			showError(`Takeback failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleTakebackRespond = async (accept: boolean) => {
		if (!boardData?.id) return;
		try {
			await gameSocket.request({ type: "game.undo.respond", gameId: boardData.id, accept });
			setTakebackRequest(null);
		} catch (error) {
			showError(`Takeback failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleResign = async () => {
		if (!boardData?.id || userColor === "Spectator") return;
		try {
			await gameSocket.request({ type: "game.resign", gameId: boardData.id });
		} catch (error) {
			showError(`Resign failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleOfferDraw = async () => {
		if (!boardData?.id || userColor === "Spectator") return;
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
			setRematchOffer(null);
			setTakebackRequest(null);
			setTakebackSent(false);
			prevMoveCountRef.current = 0;
			await gameSocket.request({
				type: "queue.join",
				timeControl: options.timeControl,
				increment: options.increment,
			});
		} catch (error) {
			setErrorMsg(error instanceof Error ? error.message : "Failed to join queue");
			setIsJoiningQueue(false);
		}
	};

	const handleLeaveQueue = async () => {
		try {
			await gameSocket.request({ type: "queue.leave" });
		} catch (error) {
			showError(error instanceof Error ? error.message : "Failed to leave queue");
		}
	};

	const handleRematchOffer = async () => {
		if (!boardData?.id) return;
		try {
			await gameSocket.request({ type: "game.rematch.offer", gameId: boardData.id });
			showError("Rematch offered");
		} catch (error) {
			showError(`Rematch failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleRematchRespond = async (accept: boolean) => {
		if (!boardData?.id) return;
		try {
			await gameSocket.request({ type: "game.rematch.respond", gameId: boardData.id, accept });
			if (!accept) setRematchOffer(null);
		} catch (error) {
			showError(`Rematch failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const isGameOver = boardData !== null && boardData.status !== "Ongoing";
	const hasActiveGame = boardData !== null && boardData.id !== 0;
	const isQueued = !hasActiveGame && queueStatus.status === "queued";

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
		<div className="h-screen flex flex-col bg-zinc-950 font-sans text-zinc-300 overflow-hidden">
			<Header
				onRestart={handleFindMatch}
				isRestarting={isJoiningQueue}
				activeTab="vs_player_online"
				currentTimeControl={boardData?.timeControl}
				currentIncrement={boardData?.increment}
				queueStatus={queueStatus.status}
			/>

			<div className="flex-1 min-h-0 flex flex-col overflow-hidden md:flex-row">
				{/* Center: opponent → board → you */}
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
					{isQueued && (
						<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 rounded-lg bg-zinc-900 border border-zinc-800 px-6 py-4 text-center">
							<p className="text-sm text-zinc-200">Searching for an opponent…</p>
							<Button
								variant="outline"
								className="mt-3 border-zinc-700"
								onClick={() => void handleLeaveQueue()}
							>
								Cancel search
							</Button>
						</div>
					)}
					{takebackRequest && (
						<div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-lg bg-zinc-900 border border-zinc-700 px-4 py-3 text-center">
							<p className="text-xs text-zinc-200">Opponent requests a takeback</p>
							<div className="mt-2 flex gap-2">
								<Button
									className="bg-zinc-100 text-zinc-900 hover:bg-white"
									onClick={() => void handleTakebackRespond(true)}
								>
									Accept
								</Button>
								<Button
									variant="outline"
									className="border-zinc-700"
									onClick={() => void handleTakebackRespond(false)}
								>
									Decline
								</Button>
							</div>
						</div>
					)}
					{rematchOffer && (
						<div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded-lg bg-zinc-900 border border-zinc-700 px-4 py-3 text-center">
							<p className="text-xs text-zinc-200">Opponent offers a rematch</p>
							<div className="mt-2 flex gap-2">
								<Button
									className="bg-zinc-100 text-zinc-900 hover:bg-white"
									onClick={() => void handleRematchRespond(true)}
								>
									Accept
								</Button>
								<Button
									variant="outline"
									className="border-zinc-700"
									onClick={() => void handleRematchRespond(false)}
								>
									Decline
								</Button>
							</div>
						</div>
					)}

					{/* Opponent card */}
					<PlayerCard
						label={hasActiveGame ? `Opponent (${opponentColor})` : "Opponent"}
						color={opponentColor}
						time={
							hasActiveGame ? formatGameTime(opponentTime, boardData?.timeControl !== 0) : "--:--"
						}
						isActive={!isUserTurn}
						capturedPieces={opponentCaptured}
						capturedByColor={userColor === "Spectator" ? "White" : (userColor as Color)}
						materialAdvantage={opponentMaterialAdv}
						showTime={boardData?.timeControl !== 0}
						isLowTime={opponentTime < 30000 && boardData?.timeControl !== 0}
						isOnline={opponentOnline ?? undefined}
					/>

					{/* Board — fills remaining height */}
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

					{/* Your card */}
					<PlayerCard
						label={hasActiveGame && userColor !== "Spectator" ? `You (${userColor})` : "You"}
						color={userColor === "Spectator" ? "White" : (userColor as Color)}
						time={hasActiveGame ? formatGameTime(userTime, boardData?.timeControl !== 0) : "--:--"}
						isActive={isUserTurn}
						capturedPieces={userCaptured}
						capturedByColor={opponentColor}
						materialAdvantage={userMaterialAdv}
						showTime={boardData?.timeControl !== 0}
						isLowTime={userTime < 30000 && boardData?.timeControl !== 0}
					/>
				</div>

				{/* Right sidebar: move history + controls */}
				<div className="h-44 w-full shrink-0 flex flex-col border-t border-zinc-800 md:h-auto md:w-72 md:border-t-0 md:border-l">
					<MoveHistory moves={boardData?.moves ?? []} />

					{hasActiveGame && userColor !== "Spectator" && (
						<div className="shrink-0 border-t border-zinc-800 p-4 flex flex-col gap-2">
							{pendingMove && (
								<div className="flex gap-2">
									<Button
										className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-white"
										onClick={() => void handleConfirmMove()}
									>
										Confirm
									</Button>
									<Button
										variant="outline"
										className="flex-1 border-zinc-700"
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
								onTakeback={() => void handleTakebackRequest()}
								drawOfferedBy={boardData?.drawOfferedBy}
								userColor={userColor as Color}
								canTakeback={!takebackSent && !pendingMove && (boardData?.moves.length ?? 0) > 0}
								isGameOngoing={boardData?.status === "Ongoing"}
							/>
							{takebackSent && (
								<p className="text-[11px] text-zinc-500 text-center">Takeback requested…</p>
							)}
						</div>
					)}
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
					<DialogFooter className="sm:justify-center mt-6 flex gap-2">
						<Button
							variant="outline"
							className="border-zinc-700 px-8"
							onClick={() => void handleRematchOffer()}
						>
							Rematch
						</Button>
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
