import type { Color, PieceType } from "@chess/types";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useSettings } from "@/lib/settings-context";
import { getPieceImageUrl, getPieceUnicode, MATERIAL_ORDER, PIECE_THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

type PlayerCardProps = {
	label: string;
	color: Color;
	time: string;
	isActive: boolean;
	capturedPieces: { key: string; piece: PieceType }[];
	capturedByColor: Color;
	materialAdvantage?: number;
	showTime?: boolean;
	icon?: React.ReactNode;
	children?: React.ReactNode;
	isLowTime?: boolean;
};

export default function PlayerCard({
	label,
	color,
	time,
	isActive,
	capturedPieces,
	capturedByColor,
	materialAdvantage = 0,
	showTime = true,
	icon,
	children,
	isLowTime = false,
}: PlayerCardProps) {
	const { settings } = useSettings();
	const pieceThemeConfig = PIECE_THEMES[settings.pieceTheme];
	const isUnicode = pieceThemeConfig?.type === "unicode";

	const groupedCaptures = useMemo(() => {
		const groups = new Map<PieceType, number>();
		for (const { piece } of capturedPieces) {
			groups.set(piece, (groups.get(piece) ?? 0) + 1);
		}
		return MATERIAL_ORDER.filter((p) => groups.has(p)).map((p) => ({
			piece: p,
			count: groups.get(p)!,
		}));
	}, [capturedPieces]);

	return (
		<Card
			className={cn(
				"bg-zinc-900 border-zinc-800 transition-opacity duration-300",
				!isActive && "opacity-50",
			)}
		>
			<CardContent className="p-4 flex flex-col gap-3">
				<div className="flex items-center gap-3">
					{icon ?? (
						<div
							className={cn(
								"flex h-10 w-10 items-center justify-center rounded text-lg font-bold border",
								color === "White"
									? "bg-zinc-100 text-zinc-900 border-zinc-200"
									: "bg-zinc-950 text-zinc-100 border-zinc-800",
							)}
						>
							{color[0]}
						</div>
					)}
					<div className="flex flex-col flex-1">
						<span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
							{label}
						</span>
						{showTime && (
							<span
								className={cn(
									"text-xl font-mono font-light",
									isLowTime ? "text-red-400" : "text-zinc-100",
								)}
							>
								{time}
							</span>
						)}
					</div>
				</div>

				{/* Captured pieces */}
				<div className="flex items-center gap-0.5 min-h-[24px] flex-wrap">
					{groupedCaptures.map(({ piece, count }) => (
						<div key={piece} className="flex items-center">
							{Array.from({ length: count }).map((_, i) => (
								<span key={`${piece}-${i}`} className="inline-flex -mr-1">
									{isUnicode ? (
										<span className="text-lg text-zinc-500 leading-none">
											{getPieceUnicode(capturedByColor, piece)}
										</span>
									) : (
										<img
											src={getPieceImageUrl(settings.pieceTheme, capturedByColor, piece)}
											alt={piece}
											className="h-5 w-5 opacity-60"
											draggable={false}
										/>
									)}
								</span>
							))}
						</div>
					))}
					{materialAdvantage !== 0 && (
						<span className="text-xs font-mono text-zinc-500 ml-1">
							{materialAdvantage > 0 ? `+${materialAdvantage}` : ""}
						</span>
					)}
				</div>

				{/* Action buttons (children) */}
				{children && <div className="flex flex-col gap-2 mt-1">{children}</div>}
			</CardContent>
		</Card>
	);
}
