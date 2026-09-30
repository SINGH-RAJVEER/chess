import type {
	BoardMove,
	BoardResponse,
	Color,
	ComputerOpponent,
	PromotionPiece,
	QueueStatusResponse,
	WsServerMessage,
} from "@chess/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from "react-native";
import ChessBoard from "../src/components/ChessBoard";
import { useAuth } from "../src/lib/auth";
import { promotionChoices, squareRow } from "../src/lib/pieces";
import { gameSocket, type SocketStatus } from "../src/lib/ws";

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
	const [socketStatus, setSocketStatus] = useState<SocketStatus>(gameSocket.getStatus());
	const [takebackRequest, setTakebackRequest] = useState<{ by: Color } | null>(null);
	const [rematchOffer, setRematchOffer] = useState<{ by: Color } | null>(null);
	const [opponentOnline, setOpponentOnline] = useState<boolean | null>(null);
	const startedRef = useRef(false);
	const cancelledRef = useRef(false);
	const loadingRef = useRef(false);
	const boardIdRef = useRef(0);
	const opponentRef = useRef(opponent);
	opponentRef.current = opponent;

	const playerId = user?.id ?? "";
	const gameId = board?.id ?? 0;
	boardIdRef.current = gameId;

	const myColor = useMemo<Color | null>(() => {
		if (mode === "computer") return "White";
		if (mode === "local") return board?.turn ?? "White";
		if (board?.userColor === "White" || board?.userColor === "Black") return board.userColor;
		return null;
	}, [mode, board]);

	const canMove = board?.status === "Ongoing" && myColor !== null && board.turn === myColor;

	const showError = useCallback((message: string) => {
		setError(message);
		setTimeout(() => setError(null), 3000);
	}, []);

	const startOnline = useCallback(async () => {
		if (!playerId || joining) return;
		setJoining(true);
		setError(null);
		try {
			await gameSocket.request({ type: "queue.join", timeControl: 10 });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to join queue");
			setJoining(false);
		}
	}, [playerId, joining]);

	const startNewGame = useCallback(async () => {
		setError(null);
		setSelected(null);
		setValidTargets([]);
		setPromotion(null);
		setTakebackRequest(null);
		setRematchOffer(null);
		try {
			if (mode === "online") {
				setBoard(null);
				setQueue({ status: "idle" });
				await startOnline();
			} else if (mode === "computer") {
				const created = await gameSocket.request({
					type: "game.new",
					mode: "vs_computer",
					opponent: opponentRef.current,
				});
				if (created.type === "game.state") setBoard(created.board);
			} else {
				const created = await gameSocket.request({
					type: "game.new",
					mode: "vs_player",
					timeControl: 10,
				});
				if (created.type === "game.state") setBoard(created.board);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to start a new game");
		}
	}, [mode, startOnline]);

	// Initial load over the socket, retried on reconnect while nothing
	// loaded yet (e.g. the server was unreachable on first mount).
	const loadInitial = useCallback(async () => {
		if (loadingRef.current) return;
		loadingRef.current = true;
		try {
			if (mode === "online") {
				const loaded = await gameSocket.request({ type: "board.get", mode: "vs_player" });
				if (cancelledRef.current) return;
				if (loaded.type === "game.state" && loaded.board.id !== 0) {
					setBoard(loaded.board);
					await gameSocket
						.request({ type: "game.join", gameId: loaded.board.id })
						.catch(() => undefined);
				} else {
					await startOnline();
				}
			} else if (mode === "computer") {
				const loaded = await gameSocket.request({ type: "board.get", mode: "vs_computer" });
				if (cancelledRef.current) return;
				if (loaded.type === "game.state" && loaded.board.id !== 0) {
					setBoard(loaded.board);
					await gameSocket
						.request({ type: "game.join", gameId: loaded.board.id })
						.catch(() => undefined);
				} else {
					const created = await gameSocket.request({
						type: "game.new",
						mode: "vs_computer",
						opponent: opponentRef.current,
					});
					if (!cancelledRef.current && created.type === "game.state") setBoard(created.board);
				}
			} else {
				const created = await gameSocket.request({
					type: "game.new",
					mode: "vs_player",
					timeControl: 10,
				});
				if (!cancelledRef.current && created.type === "game.state") setBoard(created.board);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load board");
		} finally {
			loadingRef.current = false;
		}
	}, [mode, startOnline]);

	// Single socket for all modes. Pushes replace the old queue/board
	// polling loops; reconnects re-join the current room automatically.
	useEffect(() => {
		if (mode === "online" && !isAuthLoading && !user) {
			router.replace("/sign-in");
			return;
		}
		if (mode === "online" && isAuthLoading) return;
		if (startedRef.current) return;
		startedRef.current = true;

		gameSocket.connect();
		const offStatus = gameSocket.onStatus(setSocketStatus);
		const offMessages = gameSocket.subscribe((msg: WsServerMessage) => {
			switch (msg.type) {
				case "game.state":
					setBoard(msg.board);
					break;
				case "queue.status":
					setQueue({ status: msg.status, gameId: msg.gameId, timeControl: msg.timeControl });
					setJoining(false);
					break;
				case "game.matched":
					setQueue({ status: "matched", gameId: msg.gameId });
					setJoining(false);
					setTakebackRequest(null);
					setRematchOffer(null);
					break;
				case "presence": {
					const myTurn = boardIdRef.current !== 0;
					if (myTurn) {
						setBoard((current) => {
							if (!current || current.id !== msg.gameId) return current;
							const mine = current.userColor;
							setOpponentOnline(
								mine === "White" ? msg.blackOnline : mine === "Black" ? msg.whiteOnline : null,
							);
							return current;
						});
					}
					break;
				}
				case "game.undo.requested":
					setTakebackRequest({ by: msg.by });
					break;
				case "game.undo.result":
					if (!msg.accepted) showError("Takeback declined");
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

		void (async () => {
			if (cancelledRef.current) return;
			await loadInitial();
		})();

		const offReconnect = gameSocket.onStatus((status) => {
			if (status !== "open" || cancelledRef.current) return;
			if (boardIdRef.current !== 0) {
				gameSocket
					.request({ type: "game.join", gameId: boardIdRef.current })
					.catch(() => undefined);
			} else {
				void loadInitial();
			}
		});

		return () => {
			cancelledRef.current = true;
			offStatus();
			offMessages();
			offReconnect();
			gameSocket.disconnect();
		};
	}, [mode, user, isAuthLoading, router, startOnline, showError]);

	const submitMove = useCallback(
		async (from: number, to: number, promotionPiece?: PromotionPiece) => {
			if (!gameId || busy) return;
			setBusy(true);
			setError(null);
			try {
				await gameSocket.request({
					type: "game.move",
					from,
					to,
					gameId,
					promotion: promotionPiece,
					opponent: mode === "computer" ? opponent : undefined,
				});
				setSelected(null);
				setValidTargets([]);
				setPromotion(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Move failed");
			} finally {
				setBusy(false);
			}
		},
		[gameId, busy, mode, opponent],
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
					const result = await gameSocket.request({ type: "moves.get", square, gameId: board.id });
					if (result.type === "moves.result") setValidTargets(result.targets);
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
			await gameSocket.request({ type: "game.resign", gameId });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to resign");
		}
	}, [gameId, myColor]);

	const handleTakeback = useCallback(async () => {
		if (!gameId) return;
		try {
			await gameSocket.request({ type: "game.undo.request", gameId });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Takeback failed");
		}
	}, [gameId]);

	const handleTakebackRespond = useCallback(
		async (accept: boolean) => {
			if (!gameId) return;
			try {
				await gameSocket.request({ type: "game.undo.respond", gameId, accept });
				setTakebackRequest(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Takeback failed");
			}
		},
		[gameId],
	);

	const handleOfferDraw = useCallback(async () => {
		if (!gameId) return;
		try {
			await gameSocket.request({ type: "game.draw.offer", gameId });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Draw offer failed");
		}
	}, [gameId]);

	const handleRematch = useCallback(async () => {
		if (!gameId) return;
		try {
			await gameSocket.request({ type: "game.rematch.offer", gameId });
			showError("Rematch offered");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Rematch failed");
		}
	}, [gameId, showError]);

	const handleRematchRespond = useCallback(
		async (accept: boolean) => {
			if (!gameId) return;
			try {
				await gameSocket.request({ type: "game.rematch.respond", gameId, accept });
				if (!accept) setRematchOffer(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Rematch failed");
			}
		},
		[gameId],
	);

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
				{queue.status === "queued" ? (
					<Pressable
						onPress={() => void gameSocket.request({ type: "queue.leave" })}
						className="mt-4 rounded-md border border-zinc-700 px-4 py-2"
					>
						<Text className="text-xs font-medium text-zinc-200">Cancel search</Text>
					</Pressable>
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
					{mode === "online" && opponentOnline !== null
						? opponentOnline
							? " · online"
							: " · offline"
						: ""}
					{socketStatus !== "open" ? " · reconnecting…" : ""}
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

			{takebackRequest ? (
				<View className="mb-2 flex-row items-center justify-between rounded-lg border border-zinc-700 px-3 py-2">
					<Text className="text-xs text-zinc-200">Opponent requests a takeback</Text>
					<View className="flex-row gap-2">
						<Pressable
							onPress={() => void handleTakebackRespond(true)}
							className="rounded-md bg-zinc-100 px-3 py-1.5"
						>
							<Text className="text-xs font-medium text-zinc-900">Accept</Text>
						</Pressable>
						<Pressable
							onPress={() => void handleTakebackRespond(false)}
							className="rounded-md border border-zinc-700 px-3 py-1.5"
						>
							<Text className="text-xs text-zinc-200">Decline</Text>
						</Pressable>
					</View>
				</View>
			) : null}
			{rematchOffer ? (
				<View className="mb-2 flex-row items-center justify-between rounded-lg border border-zinc-700 px-3 py-2">
					<Text className="text-xs text-zinc-200">Opponent offers a rematch</Text>
					<View className="flex-row gap-2">
						<Pressable
							onPress={() => void handleRematchRespond(true)}
							className="rounded-md bg-zinc-100 px-3 py-1.5"
						>
							<Text className="text-xs font-medium text-zinc-900">Accept</Text>
						</Pressable>
						<Pressable
							onPress={() => void handleRematchRespond(false)}
							className="rounded-md border border-zinc-700 px-3 py-1.5"
						>
							<Text className="text-xs text-zinc-200">Decline</Text>
						</Pressable>
					</View>
				</View>
			) : null}

			<ChessBoard
				pieces={board?.pieces ?? []}
				boardData={board}
				selectedSquare={selected}
				validMoves={validTargets}
				flipped={mode !== "local" && myColor === "Black"}
				onSquarePress={(square) => void handleSquarePress(square)}
			/>

			{error ? <Text className="pt-2 text-center text-sm text-red-400">{error}</Text> : null}

			<View className="mt-2 flex-row gap-2">
				{board?.status === "Ongoing" ? (
					<>
						<Pressable
							onPress={() => void handleTakeback()}
							className="flex-1 items-center rounded-md border border-zinc-700 px-3 py-2"
						>
							<Text className="text-xs font-medium text-zinc-200">Takeback</Text>
						</Pressable>
						{mode === "online" ? (
							<Pressable
								onPress={() => void handleOfferDraw()}
								className="flex-1 items-center rounded-md border border-zinc-700 px-3 py-2"
							>
								<Text className="text-xs font-medium text-zinc-200">Draw</Text>
							</Pressable>
						) : null}
					</>
				) : mode === "online" ? (
					<Pressable
						onPress={() => void handleRematch()}
						className="flex-1 items-center rounded-md border border-zinc-700 px-3 py-2"
					>
						<Text className="text-xs font-medium text-zinc-200">Rematch</Text>
					</Pressable>
				) : null}
			</View>

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
