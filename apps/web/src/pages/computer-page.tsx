import type { BoardResponse, ComputerOpponent, PromotionPiece } from "@chess/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComputerGameView, { type PromotionState } from "@/components/computer-game-view";
import { getBoard, getMoves, makeMove, resetGame, resignGame, undoMove } from "@/lib/api";
import {
	buildCapturedPieceEntries,
	getClockTime,
	getPreviewPieces,
	type PendingMove,
} from "@/lib/game-utils";
import { useSettings } from "@/lib/settings-context";
import { playSound, resumeAudioContext } from "@/lib/sounds";
import { calculateMaterialAdvantage } from "@/lib/themes";

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
	const [promotionState, setPromotionState] = useState<PromotionState | null>(null);
	const [opponent, setOpponent] = useState<ComputerOpponent>(() => {
		return localStorage.getItem("chess_computer_opponent") === "dqn" ? "dqn" : "minimax";
	});
	const prevMoveCountRef = useRef(0);

	const fetchBoard = useCallback(async () => {
		try {
			setBoardData(await getBoard({ mode: "vs_computer" }));
		} catch (error) {
			console.error("Failed to fetch board:", error);
		}
	}, []);

	useEffect(() => {
		void fetchBoard();
	}, [fetchBoard]);

	useEffect(() => {
		if (
			!boardData ||
			boardData.mode !== "vs_computer" ||
			boardData.turn !== "Black" ||
			boardData.status !== "Ongoing"
		) {
			return;
		}
		const id = window.setInterval(() => void fetchBoard(), 1000);
		return () => window.clearInterval(id);
	}, [boardData, fetchBoard]);

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
		if (!boardData || boardData.status !== "Ongoing") return;
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
			await makeMove({ ...move, gameId: boardData.id, promotion, opponent });
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
					await undoMove({ gameId: boardData.id });
					await undoMove({ gameId: boardData.id });
				} else if (moveCount === 1) {
					await undoMove({ gameId: boardData.id });
				}
			} else if (moveCount >= 1) {
				await undoMove({ gameId: boardData.id });
			}
			await fetchBoard();
		} catch (error) {
			console.error("Takeback failed", error);
		} finally {
			setIsUndoPending(false);
		}
	};

	const handleResign = async () => {
		if (!boardData?.id) return;
		await resignGame(boardData.id, "White");
		await fetchBoard();
	};

	const handleReset = async () => {
		try {
			setIsResetPending(true);
			await resetGame({ mode: "vs_computer", timeControl: 0 });
			setSelectedSquare(null);
			setValidMoves([]);
			setPendingMove(null);
			setErrorMsg(null);
			prevMoveCountRef.current = 0;
			if (settings.soundEnabled) playSound("gameStart");
			await fetchBoard();
		} catch (error) {
			setErrorMsg(`Reset failed: ${error instanceof Error ? error.message : String(error)}`);
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
	);
}
