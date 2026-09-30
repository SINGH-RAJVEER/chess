import type {
	BoardResponse,
	ComputerOpponent,
	PromotionPiece,
	WsServerMessage,
} from "@chess/types";
import { WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComputerGameView, { type PromotionState } from "@/components/computer-game-view";
import {
	buildCapturedPieceEntries,
	getClockTime,
	getPreviewPieces,
	type PendingMove,
} from "@/lib/game-utils";
import { useSettings } from "@/lib/settings-context";
import { playSound, resumeAudioContext } from "@/lib/sounds";
import { calculateMaterialAdvantage } from "@/lib/themes";
import { gameSocket, type SocketStatus } from "@/lib/ws";

export default function ComputerPage() {
	const { settings } = useSettings();
	const [boardData, setBoardData] = useState<BoardResponse | null>(null);
	const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
	const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
	const [validMoves, setValidMoves] = useState<number[]>([]);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [now, setNow] = useState(Date.now());
	const [isMovePending, setIsMovePending] = useState(false);
	const [isUndoPending, setIsUndoPending] = useState(false);
	const [isResetPending, setIsResetPending] = useState(false);
	const [socketStatus, setSocketStatus] = useState<SocketStatus>(gameSocket.getStatus());
	const [promotionState, setPromotionState] = useState<PromotionState | null>(null);
	const [opponent, setOpponent] = useState<ComputerOpponent>(() => {
		const stored = localStorage.getItem("chess_computer_opponent");
		// Legacy "dqn" selections map to the custom engine, which is the
		// strongest remaining opponent.
		return stored === "custom" || stored === "dqn" ? "custom" : "minimax";
	});
	const prevMoveCountRef = useRef(0);
	const boardIdRef = useRef(0);
	const opponentRef = useRef(opponent);
	opponentRef.current = opponent;

	const showError = useCallback((message: string) => {
		setErrorMsg(message);
		setTimeout(() => setErrorMsg(null), 3000);
	}, []);

	// Single-player runs over the same socket: the server pushes the board
	// immediately after the human move and again when the engine replies,
	// replacing the old 1s poll for Black's move.
	useEffect(() => {
		let cancelled = false;
		let loading = false;
		const loadInitial = async () => {
			if (loading) return;
			loading = true;
			try {
				const board = await gameSocket.request({ type: "board.get", mode: "vs_computer" });
				if (cancelled) return;
				if (board.type === "game.state") {
					if (board.board.id === 0) {
						const created = await gameSocket.request({
							type: "game.new",
							mode: "vs_computer",
							opponent: opponentRef.current,
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
				console.error("Failed to load computer board over socket:", error);
			} finally {
				loading = false;
			}
		};

		gameSocket.connect();
		const offStatus = gameSocket.onStatus(setSocketStatus);
		const offMessages = gameSocket.subscribe((msg: WsServerMessage) => {
			if (msg.type === "game.state" && msg.board.mode === "vs_computer") {
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
		if (boardData?.status !== "Ongoing") return;
		if (turn !== "White" || pendingMove) return;

		const clickedPiece = pieces.find((p) => p.square === squareIndex);

		if (clickedPiece && clickedPiece.color === "White") {
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
				showError(`API Error: ${error instanceof Error ? error.message : "Unknown"}`);
				setValidMoves([]);
			}
			return;
		}

		if (selectedSquare !== null && validMoves.includes(squareIndex)) {
			const movingPiece = pieces.find((p) => p.square === selectedSquare);
			const destRow = Math.floor(squareIndex / 8);
			const isPromotion =
				movingPiece?.piece_type === "Pawn" && movingPiece.color === "White" && destRow === 0;

			if (isPromotion && !settings.autoQueen) {
				setPromotionState({ from: selectedSquare, to: squareIndex, color: "White" });
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
			await gameSocket.request({
				...move,
				gameId: boardData.id,
				promotion,
				opponent,
				type: "game.move",
			});
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

	const handleOpponentChange = (nextOpponent: ComputerOpponent) => {
		setOpponent(nextOpponent);
		localStorage.setItem("chess_computer_opponent", nextOpponent);
	};

	const handleTakeback = async () => {
		if (!boardData?.id || isUndoPending) return;
		try {
			setIsUndoPending(true);
			const moveCount = boardData.moves.length;
			if (turn === "White") {
				if (moveCount >= 2) {
					await gameSocket.request({ type: "game.undo.request", gameId: boardData.id });
					await gameSocket.request({ type: "game.undo.request", gameId: boardData.id });
				} else if (moveCount === 1) {
					await gameSocket.request({ type: "game.undo.request", gameId: boardData.id });
				}
			} else if (moveCount >= 1) {
				await gameSocket.request({ type: "game.undo.request", gameId: boardData.id });
			}
		} catch (error) {
			console.error("Takeback failed", error);
		} finally {
			setIsUndoPending(false);
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

	const handleReset = async () => {
		try {
			setIsResetPending(true);
			const created = await gameSocket.request({ type: "game.new", mode: "vs_computer", opponent });
			if (created.type === "game.state") setBoardData(created.board);
			setSelectedSquare(null);
			setValidMoves([]);
			setPendingMove(null);
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
				const winner = boardData.turn === "White" ? "Engine" : "You";
				return `${winner} wins by checkmate`;
			}
			case "Timeout": {
				const winner = boardData.turn === "White" ? "Engine" : "You";
				return `${winner} wins on time`;
			}
			case "Resignation":
				return "You resigned";
			case "Stalemate":
				return "Draw by stalemate";
			case "InsufficientMaterial":
				return "Draw by insufficient material";
			case "ThreefoldRepetition":
				return "Draw by threefold repetition";
			case "FiftyMoveRule":
				return "Draw by fifty-move rule";
			case "Draw":
				return "Draw";
			default:
				return "";
		}
	};

	return (
		<div className="relative">
			{socketStatus !== "open" && (
				<div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 rounded bg-zinc-800/90 px-4 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-sm flex items-center gap-2">
					<WifiOff className="size-3" />
					Reconnecting…
				</div>
			)}
			<ComputerGameView
				boardData={boardData}
				pieces={pieces}
				selectedSquare={selectedSquare}
				validMoves={validMoves}
				pendingMove={pendingMove}
				promotionState={promotionState}
				errorMsg={errorMsg}
				turn={turn}
				whiteTime={whiteTime}
				blackTime={blackTime}
				capturedWhite={capturedWhite}
				capturedBlack={capturedBlack}
				materialAdvantage={materialAdv}
				isMovePending={isMovePending}
				isUndoPending={isUndoPending}
				isResetPending={isResetPending}
				isGameOver={isGameOver}
				gameOverMessage={getGameOverMessage()}
				opponent={opponent}
				onRestart={() => void handleReset()}
				onSquareClick={(square) => void handleSquareClick(square)}
				onConfirmMove={(promotion) => void handleConfirmMove(promotion)}
				onCancelMove={handleCancelMove}
				onPromotionSelect={handlePromotionSelect}
				onTakeback={() => void handleTakeback()}
				onResign={() => void handleResign()}
				onOpponentChange={handleOpponentChange}
			/>
		</div>
	);
}
