import type { BoardPiece, BoardResponse } from "@chess/types";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { getPieceUnicode, squareCol, squareRow } from "../lib/pieces";

const LIGHT_SQUARE = "#f0d9b5";
const DARK_SQUARE = "#b58863";

type ChessBoardProps = {
	pieces: BoardPiece[];
	boardData: BoardResponse | null;
	selectedSquare: number | null;
	validMoves: number[];
	flipped?: boolean;
	onSquarePress: (square: number) => void;
};

export default function ChessBoard({
	pieces,
	boardData,
	selectedSquare,
	validMoves,
	flipped = false,
	onSquarePress,
}: ChessBoardProps) {
	const [boardSize, setBoardSize] = useState(0);
	const squareSize = boardSize > 0 ? boardSize / 8 : 0;

	const pieceMap = useMemo(() => {
		const map = new Map<number, BoardPiece>();
		for (const piece of pieces) {
			map.set(piece.square, piece);
		}
		return map;
	}, [pieces]);

	const validMoveSet = useMemo(() => new Set(validMoves), [validMoves]);

	const orderedSquares = useMemo(() => {
		const squares: number[] = [];
		const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
		const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
		for (const row of rows) {
			for (const col of cols) {
				squares.push(row * 8 + col);
			}
		}
		return squares;
	}, [flipped]);

	const kingInCheck = useMemo(() => {
		if (!boardData?.isCheck) return -1;
		const king = pieces.find((p) => p.piece_type === "King" && p.color === boardData.turn);
		return king?.square ?? -1;
	}, [boardData, pieces]);

	return (
		<View
			className="w-full rounded-md overflow-hidden"
			onLayout={(event) => setBoardSize(event.nativeEvent.layout.width)}
			style={squareSize > 0 ? { height: boardSize } : undefined}
		>
			{orderedSquares.map((squareIndex, position) => {
				const row = squareRow(squareIndex);
				const col = squareCol(squareIndex);
				const piece = pieceMap.get(squareIndex);
				const isDark = (row + col) % 2 === 1;
				const isLastMove =
					boardData?.lastMove?.from === squareIndex || boardData?.lastMove?.to === squareIndex;
				const isSelected = selectedSquare === squareIndex;
				const isCheck = squareIndex === kingInCheck;
				const isTarget = validMoveSet.has(squareIndex);

				let backgroundColor = isDark ? DARK_SQUARE : LIGHT_SQUARE;
				if (isCheck) backgroundColor = "#ef4444";
				else if (isSelected) backgroundColor = "#fbbf24";
				else if (isLastMove) backgroundColor = isDark ? "#c9a227" : "#f5e08c";

				return (
					<Pressable
						key={squareIndex}
						onPress={() => onSquarePress(squareIndex)}
						accessibilityLabel={`Square ${squareIndex}`}
						style={{
							position: "absolute",
							width: squareSize,
							height: squareSize,
							left: (position % 8) * squareSize,
							top: Math.floor(position / 8) * squareSize,
							backgroundColor,
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						{piece ? (
							<Text
								style={{
									fontSize: squareSize * 0.72,
									lineHeight: squareSize * 0.8,
									color: piece.color === "White" ? "#fafafa" : "#18181b",
									textShadowColor: piece.color === "White" ? "#18181b" : "#fafafa",
									textShadowRadius: 2,
								}}
							>
								{getPieceUnicode(piece.color, piece.piece_type)}
							</Text>
						) : null}
						{!piece && isTarget ? (
							<View
								style={{
									width: squareSize * 0.28,
									height: squareSize * 0.28,
									borderRadius: squareSize * 0.14,
									backgroundColor: "rgba(24, 24, 27, 0.35)",
								}}
							/>
						) : null}
						{piece && isTarget ? (
							<View
								style={{
									position: "absolute",
									top: 3,
									right: 3,
									width: squareSize * 0.18,
									height: squareSize * 0.18,
									borderRadius: squareSize * 0.09,
									backgroundColor: "rgba(24, 24, 27, 0.4)",
								}}
							/>
						) : null}
					</Pressable>
				);
			})}
		</View>
	);
}
