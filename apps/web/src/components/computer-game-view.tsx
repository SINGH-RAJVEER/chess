import type {
	BoardPiece,
	BoardResponse,
	Color,
	ComputerOpponent,
	PromotionPiece,
	StockfishLevel,
} from "@chess/types";
import { STOCKFISH_LEVELS } from "@chess/types";
import { AlertCircle, BrainCircuit, Cpu, User } from "lucide-react";
import ChessBoard from "@/components/chess-board";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { CapturedPieceEntry, PendingMove } from "@/lib/game-utils";
import { formatGameTime } from "@/lib/game-utils";

export type PromotionState = {
	from: number;
	to: number;
	color: Color;
};

type ComputerGameViewProps = {
	boardData: BoardResponse | null;
	pieces: BoardPiece[];
	selectedSquare: number | null;
	validMoves: number[];
	pendingMove: PendingMove | null;
	promotionState: PromotionState | null;
	errorMsg: string | null;
	turn: Color;
	whiteTime: number;
	blackTime: number;
	capturedWhite: CapturedPieceEntry[];
	capturedBlack: CapturedPieceEntry[];
	materialAdvantage: number;
	isMovePending: boolean;
	isUndoPending: boolean;
	isResetPending: boolean;
	isGameOver: boolean;
	gameOverMessage: string;
	opponent: ComputerOpponent;
	level: StockfishLevel;
	onRestart: () => void;
	onSquareClick: (square: number) => void;
	onConfirmMove: (promotion?: PromotionPiece) => void;
	onCancelMove: () => void;
	onPromotionSelect: (piece: PromotionPiece) => void;
	onTakeback: () => void;
	onResign: () => void;
	onOpponentChange: (opponent: ComputerOpponent) => void;
	onLevelChange: (level: StockfishLevel) => void;
};

const OPPONENT_LABELS: Record<ComputerOpponent, string> = {
	minimax: "Default",
	custom: "Alpha-beta",
	stockfish: "Stockfish",
};

const OPPONENT_DESCRIPTIONS: Record<ComputerOpponent, string> = {
	minimax: "Default minimax engine with alpha-beta pruning.",
	custom: "Iterative-deepening alpha-beta search with quiescence and a transposition table.",
	stockfish: "Stockfish with a capped skill, depth, and think time. Level 8 is full strength.",
};

const LEVEL_ITEMS = STOCKFISH_LEVELS.map((value) => ({ value, label: `Level ${value}` }));
const OPPONENT_OPTIONS: [ComputerOpponent, string][] = [
	["minimax", OPPONENT_LABELS.minimax],
	["stockfish", OPPONENT_LABELS.stockfish],
];

export default function ComputerGameView({
	boardData,
	pieces,
	selectedSquare,
	validMoves,
	pendingMove,
	promotionState,
	errorMsg,
	turn,
	whiteTime,
	blackTime,
	capturedWhite,
	capturedBlack,
	materialAdvantage,
	isMovePending,
	isUndoPending,
	isResetPending,
	isGameOver,
	gameOverMessage,
	opponent,
	level,
	onRestart,
	onSquareClick,
	onConfirmMove,
	onCancelMove,
	onPromotionSelect,
	onTakeback,
	onResign,
	onOpponentChange,
	onLevelChange,
}: ComputerGameViewProps) {
	const hasClock = boardData?.timeControl !== 0;
	const opponentLabel =
		opponent === "stockfish" ? `Stockfish \u00b7 Level ${level}` : OPPONENT_LABELS[opponent];

	return (
		<div className="h-screen flex flex-col bg-zinc-950 font-sans text-zinc-300 overflow-hidden">
			<Header
				onRestart={onRestart}
				isRestarting={isResetPending}
				activeTab="vs_computer"
				currentTimeControl={boardData?.timeControl}
			/>

			<div className="flex-1 min-h-0 flex flex-col overflow-hidden md:flex-row">
				<div className="flex-1 min-h-0 flex flex-col p-4 gap-3 relative">
					{errorMsg && (
						<div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 rounded bg-red-900/80 px-4 py-1.5 text-xs font-medium text-red-100 backdrop-blur-sm flex items-center gap-2">
							<AlertCircle className="size-3" />
							{errorMsg}
						</div>
					)}

					<PlayerCard
						label={opponentLabel}
						color="Black"
						time={formatGameTime(blackTime, hasClock)}
						isActive={turn === "Black"}
						capturedPieces={capturedWhite}
						capturedByColor="White"
						materialAdvantage={materialAdvantage < 0 ? Math.abs(materialAdvantage) : 0}
						showTime={hasClock}
						icon={
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-zinc-950 text-zinc-100 border border-zinc-800">
								<Cpu className="size-4" />
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
								isCheck={boardData?.isCheck}
								onSquareClick={onSquareClick}
							/>
						</div>
					</div>

					<PlayerCard
						label="You"
						color="White"
						time={formatGameTime(whiteTime, hasClock)}
						isActive={turn === "White"}
						capturedPieces={capturedBlack}
						capturedByColor="Black"
						materialAdvantage={materialAdvantage > 0 ? materialAdvantage : 0}
						showTime={hasClock}
						icon={
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-zinc-100 text-zinc-900 border border-zinc-200">
								<User className="size-4" />
							</div>
						}
					/>
				</div>

				<div className="h-auto min-h-44 w-full shrink-0 flex flex-col border-t border-zinc-800 md:w-72 md:border-t-0 md:border-l">
					<div className="shrink-0 border-b border-zinc-800 p-4">
						<div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-200">
							<BrainCircuit className="size-3.5" />
							Opponent
						</div>
						<div className="flex rounded border border-zinc-800 p-0.5">
							{OPPONENT_OPTIONS.map(([value, label]) => (
									<button
										key={value}
										type="button"
										aria-pressed={opponent === value}
										onClick={() => onOpponentChange(value)}
										className={`flex-1 rounded px-1 py-1 text-[11px] font-medium transition-colors ${
											opponent === value
												? "bg-violet-500/80 text-zinc-50"
												: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
										}`}
									>
										{label}
								</button>
							))}
						</div>
						{opponent === "stockfish" && (
							<Select
								items={LEVEL_ITEMS}
								value={level}
								onValueChange={(value) => {
									if (value !== null) onLevelChange(value);
								}}
							>
								<SelectTrigger
									size="sm"
									aria-label="Stockfish level"
									className="mt-2 w-full border-zinc-800 text-xs text-zinc-200"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="bg-zinc-900 text-zinc-300 ring-zinc-800">
									{LEVEL_ITEMS.map((item) => (
										<SelectItem
											key={item.value}
											value={item.value}
											className="text-xs focus:bg-zinc-800 focus:text-zinc-100"
										>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						<p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
							{OPPONENT_DESCRIPTIONS[opponent]}
						</p>
					</div>
					<MoveHistory moves={boardData?.moves ?? []} />

					<div className="shrink-0 border-t border-zinc-800 p-4 flex flex-col gap-2">
						{turn === "White" && pendingMove ? (
							<div className="flex gap-2">
								<Button
									className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-white"
									disabled={isMovePending}
									onClick={() => onConfirmMove()}
								>
									Confirm
								</Button>
								<Button
									variant="outline"
									className="flex-1 border-zinc-700"
									disabled={isMovePending}
									onClick={onCancelMove}
								>
									Cancel
								</Button>
							</div>
						) : (
							<div className="flex gap-2 md:flex-col">
								<Button
									variant="ghost"
									className="flex-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 md:w-full"
									onClick={onTakeback}
									disabled={isUndoPending || (boardData?.moves.length || 0) === 0}
								>
									Takeback
								</Button>
								{boardData?.status === "Ongoing" && (
									<Button
										variant="ghost"
										className="flex-1 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 md:w-full"
										onClick={onResign}
									>
										Resign
									</Button>
								)}
							</div>
						)}
						{turn === "White" && pendingMove && boardData?.status === "Ongoing" && (
							<Button
								variant="ghost"
								className="w-full text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
								onClick={onResign}
							>
								Resign
							</Button>
						)}
					</div>
				</div>
			</div>

			{promotionState && (
				<PromotionDialog
					color={promotionState.color}
					onSelect={onPromotionSelect}
					onCancel={onCancelMove}
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
								: boardData?.status === "Resignation"
									? "Resigned"
									: "Game Over"}
						</DialogTitle>
						<DialogDescription className="text-center text-zinc-400 pt-2">
							{gameOverMessage}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="sm:justify-center mt-6">
						<Button className="bg-zinc-100 text-zinc-900 hover:bg-white px-8" onClick={onRestart}>
							Play Again
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
