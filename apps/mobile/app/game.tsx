import type {
	BoardMove,
	BoardResponse,
	Color,
	ComputerOpponent,
	PromotionPiece,
	QueueStatusResponse,
} from "@chess/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from "react-native";
import ChessBoard from "../src/components/ChessBoard";
import {
	getBoard,
	getMoves,
	getQueueStatus,
	joinQueue,
	makeMove,
	resetGame,
	resignGame,
} from "../src/lib/api";
import { useAuth } from "../src/lib/auth";
import { promotionChoices, squareRow } from "../src/lib/pieces";

type GameMode = "local" | "computer" | "online";

const MODE_TITLES: Record<GameMode, string> = {
	local: "Local game",
	computer: "Vs computer",
	online: "Online game",
};

function statusMessage(board: BoardResponse | null): string {
	if (!board) return "Loading board...";
	switch (board.status) {
		case "Ongoing":
			return board.turn === "White" ? "White to move" : "Black to move";
		case "Checkmate":
			return board.turn === "White" ? "Checkmate — Black wins" : "Checkmate — White wins";
		case "Stalemate":
			return "Draw — stalemate";
		case "Timeout":
			return board.turn === "White" ? "Black wins on time" : "White wins on time";
		case "Resignation":
			return "Game resigned";
		case "Draw":
			return "Draw agreed";
		case "InsufficientMaterial":
			return "Draw — insufficient material";
		case "ThreefoldRepetition":
			return "Draw — threefold repetition";
		case "FiftyMoveRule":
			return "Draw — fifty-move rule";
		default:
			return board.status;
	}
}

function pairedMoves(moves: BoardMove[]): { number: number; white?: string; black?: string }[] {
	const rows: { number: number; white?: string; black?: string }[] = [];
	for (let i = 0; i < moves.length; i += 2) {
		rows.push({
			number: i / 2 + 1,
			white: moves[i]?.notation,
			black: moves[i + 1]?.notation,
		});
	}
	return rows;
}

export default function GameScreen() {
	const router = useRouter();
	const { user, isLoading: isAuthLoading } = useAuth();
	const params = useLocalSearchParams<{ mode?: string; opponent?: string }>();
	const mode: GameMode =
		params.mode === "computer" || params.mode === "online" ? params.mode : "local";
	const opponent: ComputerOpponent = params.opponent === "custom" ? "custom" : "minimax";

	const [board, setBoard] = useState<BoardResponse | null>(null);
	const [queue, setQueue] = useState<QueueStatusResponse>({ status: "idle" });
	const [joining, setJoining] = useState(false);
	const [selected, setSelected] = useState<number | null>(null);
	const [validTargets, setValidTargets] = useState<number[]>([]);
	const [promotion, setPromotion] = useState<{ from: number; to: number } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const startedRef = useRef(false);

	const playerId = user?.id ?? "";
	const gameId = board?.id ?? 0;

	const myColor = useMemo<Color | null>(() => {
		if (mode === "computer") return "White";
		if (mode === "local") return board?.turn ?? "White";
		if (board?.userColor === "White" || board?.userColor === "Black") return board.userColor;
		return null;
	}, [mode, board]);

	const canMove = board?.status === "Ongoing" && myColor !== null && board.turn === myColor;

	const fetchBoard = useCallback(
		async (id?: number) => {
			try {
				if (mode === "online") {
					if (!playerId) return;
					setBoard(await getBoard({ mode: "vs_player", gameId: id, playerId }));
				} else if (mode === "computer") {
					setBoard(await getBoard({ mode: "vs_computer" }));
				} else {
					setBoard(await getBoard({ mode: "vs_player", gameId: id }));
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load board");
			}
		},
		[mode, playerId],
	);

	const startOnline = useCallback(async () => {
		if (!playerId || joining) return;
		setJoining(true);
		setError(null);
		try {
			const status = await joinQueue({ playerId, timeControl: 10 });
			setQueue(status);
			if (status.status === "matched" && status.gameId) {
				await fetchBoard(status.gameId);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to join queue");
		} finally {
			setJoining(false);
		}
	}, [playerId, joining, fetchBoard]);

	const startNewGame = useCallback(async () => {
		setError(null);
		setSelected(null);
		setValidTargets([]);
		setPromotion(null);
		try {
			if (mode === "online") {
				setBoard(null);
				setQueue({ status: "idle" });
				await startOnline();
			} else if (mode === "computer") {
				await resetGame({ mode: "vs_computer", timeControl: 0 });
				await fetchBoard();
			} else {
				await resetGame({ mode: "vs_player", timeControl: 10 });
				await fetchBoard();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to start a new game");
		}
	}, [mode, fetchBoard, startOnline]);

	useEffect(() => {
		if (startedRef.current) return;
		if (mode === "online") {
			if (isAuthLoading) return;
			if (!user) {
				router.replace("/sign-in");
				return;
			}
			startedRef.current = true;
			void startOnline();
			return;
		}
		startedRef.current = true;
		void fetchBoard();
	}, [mode, user, isAuthLoading, fetchBoard, startOnline, router]);

	useEffect(() => {
		if (mode !== "online" || !playerId || board) return;
		if (queue.status !== "matched" || !queue.gameId) {
			const id = setInterval(async () => {
				try {
					const status = await getQueueStatus(playerId);
					setQueue(status);
					if (status.status === "matched" && status.gameId) {
						await fetchBoard(status.gameId);
					}
				} catch (err) {
					console.error("Failed to poll queue:", err);
				}
			}, 1500);
			return () => clearInterval(id);
		}
	}, [mode, playerId, board, queue, fetchBoard]);

	useEffect(() => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
		const waiting =
			board?.status === "Ongoing" &&
			((mode === "computer" && board.turn === "Black") ||
				(mode === "online" && myColor !== null && board.turn !== myColor));
		if (!waiting) return;
		pollRef.current = setInterval(() => {
			void fetchBoard(board.id);
		}, 1500);
		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, [board, mode, myColor, fetchBoard]);

	const submitMove = useCallback(
		async (from: number, to: number, promotionPiece?: PromotionPiece) => {
			if (!gameId || busy) return;
			setBusy(true);
			setError(null);
			try {
				await makeMove({
					from,
					to,
					gameId,
					promotion: promotionPiece,
					opponent: mode === "computer" ? opponent : undefined,
				});
				setSelected(null);
				setValidTargets([]);
				setPromotion(null);
				await fetchBoard(gameId);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Move failed");
			} finally {
				setBusy(false);
			}
		},
		[gameId, busy, mode, opponent, fetchBoard],
	);

	const handleSquarePress = useCallback(
		async (square: number) => {
			if (!board || !canMove || busy || promotion) return;
			const mover = board.turn;
			const tapped = board.pieces.find((p) => p.square === square);

			if (tapped && tapped.color === mover) {
				if (selected === square) {
					setSelected(null);
					setValidTargets([]);
					return;
				}
				setSelected(square);
				try {
					setValidTargets(await getMoves({ square, gameId: board.id }));
				} catch (err) {
					setError(err instanceof Error ? err.message : "Failed to load moves");
					setValidTargets([]);
				}
				return;
			}

			if (selected !== null && validTargets.includes(square)) {
				const moving = board.pieces.find((p) => p.square === selected);
				if (
					moving?.piece_type === "Pawn" &&
					((moving.color === "White" && squareRow(square) === 0) ||
						(moving.color === "Black" && squareRow(square) === 7))
				) {
					setPromotion({ from: selected, to: square });
					setSelected(null);
					setValidTargets([]);
					return;
				}
				await submitMove(selected, square);
			}
			setSelected(null);
			setValidTargets([]);
		},
		[board, canMove, busy, promotion, selected, validTargets, submitMove],
	);

	const handleResign = useCallback(async () => {
		if (!gameId || !myColor) return;
		try {
			await resignGame(gameId, myColor);
			await fetchBoard(gameId);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to resign");
		}
	}, [gameId, myColor, fetchBoard]);

	const moveRows = useMemo(() => pairedMoves(board?.moves ?? []), [board]);

	if (mode === "online" && (isAuthLoading || (!board && queue.status !== "idle"))) {
		return (
			<View className="flex-1 bg-zinc-950 items-center justify-center px-6">
				<Text className="text-base text-zinc-300">
					{queue.status === "queued" || joining ? "Waiting for an opponent..." : "Loading game..."}
				</Text>
				{queue.status === "queued" || joining ? (
					<ActivityIndicator color="#fafafa" style={{ marginTop: 12 }} />
				) : null}
				{error ? <Text className="mt-3 text-sm text-red-400">{error}</Text> : null}
			</View>
		);
	}

	return (
		<View className="flex-1 bg-zinc-950 px-4 pt-2 pb-4">
			<View className="flex-row items-center justify-between py-2">
				<Text className="text-sm font-medium text-zinc-400">
					{MODE_TITLES[mode]}
					{mode === "computer" ? ` · ${opponent}` : ""}
					{mode === "online" && board?.userColor ? ` · playing ${board.userColor}` : ""}
				</Text>
				<View className="flex-row gap-2">
					<Pressable
						onPress={() => void startNewGame()}
						className="rounded-md border border-zinc-700 px-3 py-1.5"
					>
						<Text className="text-xs font-medium text-zinc-200">New</Text>
					</Pressable>
					{board?.status === "Ongoing" && myColor ? (
						<Pressable
							onPress={() => void handleResign()}
							className="rounded-md border border-zinc-700 px-3 py-1.5"
						>
							<Text className="text-xs font-medium text-red-400">Resign</Text>
						</Pressable>
					) : null}
				</View>
			</View>

			<Text className="pb-2 text-center text-sm text-zinc-300">{statusMessage(board)}</Text>

			<ChessBoard
				pieces={board?.pieces ?? []}
				boardData={board}
				selectedSquare={selected}
				validMoves={validTargets}
				flipped={mode !== "local" && myColor === "Black"}
				onSquarePress={(square) => void handleSquarePress(square)}
			/>

			{error ? <Text className="pt-2 text-center text-sm text-red-400">{error}</Text> : null}

			<View className="mt-3 max-h-36 rounded-lg border border-zinc-800">
				<FlatList
					data={moveRows}
					keyExtractor={(row) => String(row.number)}
					contentContainerStyle={{ padding: 10 }}
					renderItem={({ item }) => (
						<View className="flex-row py-0.5">
							<Text className="w-8 text-xs text-zinc-500">{item.number}.</Text>
							<Text className="flex-1 text-xs text-zinc-200">{item.white ?? ""}</Text>
							<Text className="flex-1 text-xs text-zinc-200">{item.black ?? ""}</Text>
						</View>
					)}
					ListEmptyComponent={<Text className="p-2 text-xs text-zinc-500">No moves yet.</Text>}
				/>
			</View>

			<Modal visible={promotion !== null} transparent animationType="fade">
				<View className="flex-1 items-center justify-center bg-black/70 px-10">
					<View className="w-full rounded-xl bg-zinc-900 p-5">
						<Text className="mb-3 text-center text-base font-semibold text-zinc-100">
							Promote to
						</Text>
						<View className="flex-row justify-between">
							{promotion && board
								? promotionChoices(board.turn).map(({ type, glyph }) => (
										<Pressable
											key={type}
											onPress={() => void submitMove(promotion.from, promotion.to, type)}
											className="h-14 w-14 items-center justify-center rounded-lg bg-zinc-800"
										>
											<Text style={{ fontSize: 32, color: "#fafafa" }}>{glyph}</Text>
										</Pressable>
									))
								: null}
						</View>
						<Pressable onPress={() => setPromotion(null)} className="mt-4 items-center">
							<Text className="text-sm text-zinc-400">Cancel</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
		</View>
	);
}
