import type { Color, PieceType } from "@chess/types";
import { useMemo } from "react";
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
		const groups = new Map<PieceType, { key: string; piece: PieceType }[]>();
		for (const entry of capturedPieces) {
			const entries = groups.get(entry.piece) ?? [];
			entries.push(entry);
			groups.set(entry.piece, entries);
		}
		return MATERIAL_ORDER.flatMap((piece) => groups.get(piece) ?? []);
	}, [capturedPieces]);

	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 transition-opacity duration-300",
				!isActive && "opacity-50",
			)}
		>
			{/* Icon */}
			{icon ?? (
				<div
					className={cn(
						"flex h-9 w-9 shrink-0 items-center justify-center rounded text-base font-bold border",
						color === "White"
							? "bg-zinc-100 text-zinc-900 border-zinc-200"
							: "bg-zinc-950 text-zinc-100 border-zinc-800",
					)}
				>
					{color[0]}
				</div>
			)}

			{/* Name + captured pieces */}
			<div className="flex flex-1 flex-col gap-1 min-w-0">
				<span className="text-sm font-medium text-zinc-300 leading-none">{label}</span>
				<div className="flex items-center gap-0.5 flex-wrap min-h-[18px]">
					{groupedCaptures.map(({ key, piece }) => (
						<span key={key} className="inline-flex -mr-1">
							{isUnicode ? (
								<span className="text-base text-zinc-500 leading-none">
									{getPieceUnicode(capturedByColor, piece)}
								</span>
							) : (
								<img
									src={getPieceImageUrl(settings.pieceTheme, capturedByColor, piece)}
									alt={piece}
									className="h-[18px] w-[18px] opacity-60"
									draggable={false}
								/>
							)}
						</span>
					))}
					{materialAdvantage > 0 && (
						<span className="text-xs font-mono text-zinc-500 ml-1">+{materialAdvantage}</span>
					)}
				</div>
			</div>

			{/* Time + children */}
			<div className="flex flex-col items-end gap-1 shrink-0">
				{showTime && (
					<span
						className={cn(
							"text-2xl font-mono font-light tabular-nums leading-none",
							isLowTime ? "text-red-400" : "text-zinc-100",
						)}
					>
						{time}
					</span>
				)}
				{children}
			</div>
		</div>
	);
}
