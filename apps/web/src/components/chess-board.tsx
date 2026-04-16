import type { BoardPiece, BoardResponse, Color, PieceType } from "@chess/types";
import { useMemo } from "react";
import { useSettings } from "@/lib/settings-context";
import {
	BOARD_THEMES,
	getFileLabel,
	getPieceImageUrl,
	getPieceUnicode,
	getRankLabel,
	getSquareColor,
	PIECE_THEMES,
} from "@/lib/themes";

const BOARD_SQUARES = Array.from({ length: 64 }, (_, i) => i);

type ChessBoardProps = {
	pieces: BoardPiece[];
	boardData: BoardResponse | null;
	selectedSquare: number | null;
	validMoves: number[];
	flipped?: boolean;
	isCheck?: boolean;
	onSquareClick: (square: number) => void;
};

export default function ChessBoard({
	pieces,
	boardData,
	selectedSquare,
	validMoves,
	flipped = false,
	isCheck = false,
	onSquareClick,
}: ChessBoardProps) {
	const { settings } = useSettings();

	const boardTheme = BOARD_THEMES[settings.boardTheme] ?? BOARD_THEMES.green;
	const pieceThemeConfig = PIECE_THEMES[settings.pieceTheme] ?? PIECE_THEMES.cburnett;
	const isUnicode = pieceThemeConfig.type === "unicode";

	const kingSquare = useMemo(() => {
		if (!isCheck || !boardData) return -1;
		const king = pieces.find((p) => p.piece_type === "King" && p.color === boardData.turn);
		return king?.square ?? -1;
	}, [isCheck, boardData, pieces]);

	const pieceMap = useMemo(() => {
		const map = new Map<number, BoardPiece>();
		for (const piece of pieces) {
			map.set(piece.square, piece);
		}
		return map;
	}, [pieces]);

	const validMoveSet = useMemo(() => new Set(validMoves), [validMoves]);

	const orderedSquares = useMemo(() => {
		if (!flipped) return BOARD_SQUARES;
		const result: number[] = [];
		for (let row = 7; row >= 0; row--) {
			for (let col = 7; col >= 0; col--) {
				result.push(row * 8 + col);
			}
		}
		return result;
	}, [flipped]);

	return (
		<div className="relative aspect-square w-[min(85vw,600px)] overflow-hidden rounded-sm shadow-2xl select-none">
			<div className="grid h-full w-full grid-cols-8 grid-rows-[repeat(8,1fr)]">
				{orderedSquares.map((squareIndex) => {
					const row = Math.floor(squareIndex / 8);
					const col = squareIndex % 8;
					const piece = pieceMap.get(squareIndex);
					const lastMove = settings.showLastMove ? boardData?.lastMove : null;
					const isLastMove = lastMove?.from === squareIndex || lastMove?.to === squareIndex;
					const isSelected = selectedSquare === squareIndex;
					const isKingInCheck = squareIndex === kingSquare;
					const isValidTarget = settings.showLegalMoves && validMoveSet.has(squareIndex);

					const displayRow = flipped ? 7 - row : row;
					const displayCol = flipped ? 7 - col : col;
					const showFileLabel = settings.showCoordinates && displayRow === 7;
					const showRankLabel = settings.showCoordinates && displayCol === 0;

					const bgColor = getSquareColor(boardTheme, row, col, {
						isLastMove: isLastMove && !isSelected,
						isSelected,
						isCheck: isKingInCheck,
					});

					const isDark = (row + col) % 2 === 1;
					const coordColor = isDark ? boardTheme.light : boardTheme.dark;

					return (
						<button
							key={squareIndex}
							type="button"
							className="relative flex items-center justify-center focus:outline-none"
							style={{ backgroundColor: bgColor }}
							onClick={() => onSquareClick(squareIndex)}
						>
							{/* Board coordinates */}
							{showRankLabel && (
								<span
									className="absolute top-0.5 left-0.5 text-[10px] font-bold leading-none pointer-events-none z-30 select-none"
									style={{ color: coordColor }}
								>
									{getRankLabel(row)}
								</span>
							)}
							{showFileLabel && (
								<span
									className="absolute bottom-0.5 right-0.5 text-[10px] font-bold leading-none pointer-events-none z-30 select-none"
									style={{ color: coordColor }}
								>
									{getFileLabel(col)}
								</span>
							)}

							{/* Valid move indicators */}
							{isValidTarget &&
								(piece ? (
									<div className="absolute inset-0 z-10">
										<div className="absolute inset-[3px] rounded-full border-[3px] border-black/20" />
									</div>
								) : (
									<div className="absolute inset-0 z-10 flex items-center justify-center">
										<div className="h-[28%] w-[28%] rounded-full bg-black/20" />
									</div>
								))}

							{/* Piece rendering */}
							{piece && (
								<PieceRenderer
									color={piece.color}
									pieceType={piece.piece_type}
									themeName={settings.pieceTheme}
									isUnicode={isUnicode}
								/>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

function PieceRenderer({
	color,
	pieceType,
	themeName,
	isUnicode,
}: {
	color: Color;
	pieceType: PieceType;
	themeName: string;
	isUnicode: boolean;
}) {
	if (isUnicode) {
		return (
			<span
				className="z-20 text-4xl sm:text-5xl md:text-6xl select-none pointer-events-none"
				style={{
					color: color === "White" ? "#fff" : "#000",
					filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
					lineHeight: 1,
				}}
			>
				{getPieceUnicode(color, pieceType)}
			</span>
		);
	}

	return (
		<img
			src={getPieceImageUrl(themeName, color, pieceType)}
			alt={`${color} ${pieceType}`}
			className="z-20 h-[85%] w-[85%] pointer-events-none select-none"
			style={{
				filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))",
			}}
			draggable={false}
		/>
	);
}
