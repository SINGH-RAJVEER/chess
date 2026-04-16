import type { Color } from "@chess/types";
import { Flag, Handshake, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type GameControlsProps = {
	onResign?: () => void;
	onOfferDraw?: () => void;
	onAcceptDraw?: () => void;
	onDeclineDraw?: () => void;
	onTakeback?: () => void;
	drawOfferedBy?: Color | null;
	userColor?: Color;
	canTakeback?: boolean;
	canResign?: boolean;
	canOfferDraw?: boolean;
	isGameOngoing?: boolean;
};

export default function GameControls({
	onResign,
	onOfferDraw,
	onAcceptDraw,
	onDeclineDraw,
	onTakeback,
	drawOfferedBy,
	userColor,
	canTakeback = false,
	canResign = true,
	canOfferDraw = true,
	isGameOngoing = true,
}: GameControlsProps) {
	const [confirmResign, setConfirmResign] = useState(false);

	if (!isGameOngoing) return null;

	const isDrawOfferedToUser = drawOfferedBy != null && drawOfferedBy !== userColor;

	return (
		<div className="flex flex-col gap-2">
			{/* Draw offer received */}
			{isDrawOfferedToUser && (
				<div className="flex flex-col gap-1.5 p-2 bg-zinc-800/50 rounded-md border border-zinc-700">
					<span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
						Draw offered
					</span>
					<div className="flex gap-2">
						<Button
							size="sm"
							className="flex-1 bg-zinc-100 text-zinc-900 hover:bg-white h-7 text-xs"
							onClick={onAcceptDraw}
						>
							Accept
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="flex-1 border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 h-7 text-xs"
							onClick={onDeclineDraw}
						>
							Decline
						</Button>
					</div>
				</div>
			)}

			{/* Resign confirmation */}
			{confirmResign ? (
				<div className="flex flex-col gap-1.5 p-2 bg-red-900/20 rounded-md border border-red-900/30">
					<span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">
						Resign?
					</span>
					<div className="flex gap-2">
						<Button
							size="sm"
							className="flex-1 bg-red-600 text-white hover:bg-red-500 h-7 text-xs"
							onClick={() => {
								onResign?.();
								setConfirmResign(false);
							}}
						>
							<Flag className="size-3 mr-1" />
							Yes
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="flex-1 border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 h-7 text-xs"
							onClick={() => setConfirmResign(false)}
						>
							<X className="size-3 mr-1" />
							No
						</Button>
					</div>
				</div>
			) : (
				<div className="flex gap-2">
					{canTakeback && (
						<Button
							size="sm"
							variant="ghost"
							className="flex-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 h-7 text-xs"
							onClick={onTakeback}
						>
							<RotateCcw className="size-3 mr-1" />
							Takeback
						</Button>
					)}
					{canOfferDraw && !isDrawOfferedToUser && (
						<Button
							size="sm"
							variant="ghost"
							className="flex-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 h-7 text-xs"
							onClick={onOfferDraw}
							disabled={drawOfferedBy === userColor}
						>
							<Handshake className="size-3 mr-1" />
							{drawOfferedBy === userColor ? "Offered" : "Draw"}
						</Button>
					)}
					{canResign && (
						<Button
							size="sm"
							variant="ghost"
							className="flex-1 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 h-7 text-xs"
							onClick={() => setConfirmResign(true)}
						>
							<Flag className="size-3 mr-1" />
							Resign
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
