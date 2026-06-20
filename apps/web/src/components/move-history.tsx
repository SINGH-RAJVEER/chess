import type { BoardMove } from "@chess/types";
import { useEffect, useMemo, useRef } from "react";

type MoveHistoryProps = {
	moves: BoardMove[];
	currentMoveIndex?: number;
	onNavigate?: (moveIndex: number) => void;
};

export default function MoveHistory({ moves, currentMoveIndex, onNavigate }: MoveHistoryProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const movePairs = useMemo(() => {
		return Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => {
			const moveIndex = index * 2;
			return {
				moveNumber: index + 1,
				whiteMove: moves[moveIndex],
				whiteMoveIndex: moveIndex,
				blackMove: moves[moveIndex + 1],
				blackMoveIndex: moveIndex + 1,
			};
		});
	}, [moves]);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	});

	const activeIndex = currentMoveIndex ?? moves.length - 1;

	function formatNotation(move: BoardMove): string {
		if (!move) return "";
		let notation = move.notation;
		if (move.isCheckmate) {
			notation = `${notation.replace(/[+#]*$/, "")}#`;
		} else if (move.isCheck) {
			notation = `${notation.replace(/[+#]*$/, "")}+`;
		}
		return notation;
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div className="px-4 py-3 border-b border-zinc-800">
				<span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Moves</span>
			</div>
			<div ref={scrollRef} className="flex-1 overflow-y-auto">
				{movePairs.length === 0 ? (
					<p className="px-4 py-6 text-xs text-zinc-600 text-center">No moves yet</p>
				) : (
					<table className="w-full text-sm font-mono">
						<tbody>
							{movePairs.map(({ moveNumber, whiteMove, whiteMoveIndex, blackMove, blackMoveIndex }) => (
								<tr
									key={moveNumber}
									className="border-b border-zinc-900 hover:bg-zinc-900/40"
								>
									<td className="pl-4 pr-2 py-1.5 text-xs text-zinc-600 w-8 select-none">
										{moveNumber}.
									</td>
									<td className="px-1 py-1.5 w-1/2">
										{whiteMove && (
											<button
												type="button"
												className={`w-full text-left px-2 py-0.5 rounded transition-colors ${
													whiteMoveIndex === activeIndex
														? "bg-zinc-700 text-zinc-100"
														: "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
												}`}
												onClick={() => onNavigate?.(whiteMoveIndex)}
											>
												{formatNotation(whiteMove)}
											</button>
										)}
									</td>
									<td className="px-1 py-1.5 pr-4 w-1/2">
										{blackMove && (
											<button
												type="button"
												className={`w-full text-left px-2 py-0.5 rounded transition-colors ${
													blackMoveIndex === activeIndex
														? "bg-zinc-700 text-zinc-100"
														: "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
												}`}
												onClick={() => onNavigate?.(blackMoveIndex)}
											>
												{formatNotation(blackMove)}
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
