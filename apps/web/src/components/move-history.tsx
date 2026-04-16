import type { BoardMove } from "@chess/types";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
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
			scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
		}
	}, [moves.length]);

	const activeIndex = currentMoveIndex ?? moves.length - 1;

	function formatNotation(move: BoardMove): string {
		if (!move) return "";

		let notation = move.notation;

		if (move.isCheckmate) {
			notation = notation.replace(/[+#]*$/, "") + "#";
		} else if (move.isCheck) {
			notation = notation.replace(/[+#]*$/, "") + "+";
		}

		return notation;
	}

	return (
		<div className="border-t border-zinc-900 bg-zinc-950 p-3">
			<div className="mx-auto max-w-6xl">
				<div className="flex items-center gap-3">
					<span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest shrink-0">
						Moves
					</span>

					{/* Navigation buttons */}
					{onNavigate && moves.length > 0 && (
						<div className="flex gap-0.5 shrink-0">
							<button
								type="button"
								className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30"
								onClick={() => onNavigate(-1)}
								disabled={activeIndex < 0}
							>
								<ChevronFirst className="size-3.5" />
							</button>
							<button
								type="button"
								className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30"
								onClick={() => onNavigate(Math.max(-1, activeIndex - 1))}
								disabled={activeIndex < 0}
							>
								<ChevronLeft className="size-3.5" />
							</button>
							<button
								type="button"
								className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30"
								onClick={() => onNavigate(Math.min(moves.length - 1, activeIndex + 1))}
								disabled={activeIndex >= moves.length - 1}
							>
								<ChevronRight className="size-3.5" />
							</button>
							<button
								type="button"
								className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30"
								onClick={() => onNavigate(moves.length - 1)}
								disabled={activeIndex >= moves.length - 1}
							>
								<ChevronLast className="size-3.5" />
							</button>
						</div>
					)}

					{/* Scrollable move list */}
					<div ref={scrollRef} className="flex gap-3 overflow-x-auto no-scrollbar">
						{movePairs.map(
							({ moveNumber, whiteMove, whiteMoveIndex, blackMove, blackMoveIndex }) => (
								<div key={moveNumber} className="flex gap-1.5 text-xs font-mono shrink-0">
									<span className="text-zinc-700 w-5 text-right">{moveNumber}.</span>
									{whiteMove && (
										<button
											type="button"
											className={`px-1 rounded transition-colors ${
												whiteMoveIndex === activeIndex
													? "bg-zinc-700 text-zinc-100"
													: "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
											}`}
											onClick={() => onNavigate?.(whiteMoveIndex)}
										>
											{formatNotation(whiteMove)}
										</button>
									)}
									{blackMove && (
										<button
											type="button"
											className={`px-1 rounded transition-colors ${
												blackMoveIndex === activeIndex
													? "bg-zinc-700 text-zinc-100"
													: "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
											}`}
											onClick={() => onNavigate?.(blackMoveIndex)}
										>
											{formatNotation(blackMove)}
										</button>
									)}
								</div>
							),
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
