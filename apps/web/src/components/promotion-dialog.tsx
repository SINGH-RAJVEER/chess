import type { Color, PromotionPiece } from "@chess/types";
import { useSettings } from "@/lib/settings-context";
import { getPieceImageUrl, getPieceUnicode, PIECE_THEMES } from "@/lib/themes";

type PromotionDialogProps = {
	color: Color;
	onSelect: (piece: PromotionPiece) => void;
	onCancel: () => void;
};

const PROMOTION_PIECES: PromotionPiece[] = ["Queen", "Rook", "Bishop", "Knight"];

export default function PromotionDialog({ color, onSelect, onCancel }: PromotionDialogProps) {
	const { settings } = useSettings();
	const pieceThemeConfig = PIECE_THEMES[settings.pieceTheme];
	const isUnicode = pieceThemeConfig?.type === "unicode";

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="flex flex-col items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-700 p-4 shadow-2xl">
				<span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
					Promote to
				</span>
				<div className="flex gap-2">
					{PROMOTION_PIECES.map((piece) => (
						<button
							key={piece}
							type="button"
							className="flex h-16 w-16 items-center justify-center rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors border border-zinc-700 hover:border-zinc-500"
							onClick={() => onSelect(piece)}
						>
							{isUnicode ? (
								<span
									className="text-4xl select-none"
									style={{
										color: color === "White" ? "#fff" : "#000",
										filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
									}}
								>
									{getPieceUnicode(color, piece)}
								</span>
							) : (
								<img
									src={getPieceImageUrl(settings.pieceTheme, color, piece)}
									alt={`${color} ${piece}`}
									className="h-12 w-12"
									draggable={false}
								/>
							)}
						</button>
					))}
				</div>
				<button
					type="button"
					className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
					onClick={onCancel}
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
