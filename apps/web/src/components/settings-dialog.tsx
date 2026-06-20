import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSettings } from "@/lib/settings-context";
import { BOARD_THEMES, getPieceImageUrl, getPieceUnicode, PIECE_THEMES } from "@/lib/themes";

type SettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const SETTINGS_TABS = [
	{ id: "board", label: "Board" },
	{ id: "pieces", label: "Pieces" },
	{ id: "play", label: "Play" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
	const { settings, updateSettings, resetSettings } = useSettings();
	const [activeTab, setActiveTab] = useState<SettingsTab>("board");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="text-lg font-medium">Settings</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-5 mt-2">
					<div
						role="tablist"
						aria-label="Settings sections"
						className="grid grid-cols-3 rounded bg-zinc-950 p-1"
					>
						{SETTINGS_TABS.map((tab) => (
							<button
								key={tab.id}
								type="button"
								role="tab"
								aria-selected={activeTab === tab.id}
								aria-controls={`settings-panel-${tab.id}`}
								id={`settings-tab-${tab.id}`}
								className={`rounded px-3 py-1.5 text-sm transition-colors ${
									activeTab === tab.id
										? "bg-zinc-100 text-zinc-900"
										: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
								}`}
								onClick={() => setActiveTab(tab.id)}
							>
								{tab.label}
							</button>
						))}
					</div>

					{activeTab === "board" && (
						<section
							id="settings-panel-board"
							role="tabpanel"
							aria-labelledby="settings-tab-board"
							className="flex flex-col gap-4"
						>
							<h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
								Board Theme
							</h3>
							<div className="grid grid-cols-3 gap-2">
								{Object.entries(BOARD_THEMES).map(([key, theme]) => (
									<button
										key={key}
										type="button"
										className={`relative flex flex-col items-center gap-1.5 rounded-md p-2 transition-colors ${
											settings.boardTheme === key
												? "bg-zinc-700 ring-1 ring-zinc-500"
												: "bg-zinc-800 hover:bg-zinc-700/50"
										}`}
										onClick={() => updateSettings({ boardTheme: key })}
									>
										<div className="grid grid-cols-4 grid-rows-2 rounded overflow-hidden w-full aspect-[2/1]">
											{Array.from({ length: 8 }).map((_, i) => {
												const row = Math.floor(i / 4);
												const col = i % 4;
												const isDark = (row + col) % 2 === 1;
												return (
													<div
														key={`preview-square-${row}-${col}`}
														style={{
															backgroundColor: isDark ? theme.dark : theme.light,
														}}
													/>
												);
											})}
										</div>
										<span className="text-[10px] text-zinc-400">{theme.name}</span>
										{settings.boardTheme === key && (
											<div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100">
												<Check className="size-2.5 text-zinc-900" />
											</div>
										)}
									</button>
								))}
							</div>
							<ToggleRow
								label="Board coordinates"
								checked={settings.showCoordinates}
								onChange={(v) => updateSettings({ showCoordinates: v })}
							/>
							<ToggleRow
								label="Highlight last move"
								checked={settings.showLastMove}
								onChange={(v) => updateSettings({ showLastMove: v })}
							/>
							<ToggleRow
								label="Show legal moves"
								checked={settings.showLegalMoves}
								onChange={(v) => updateSettings({ showLegalMoves: v })}
							/>
						</section>
					)}

					{activeTab === "pieces" && (
						<section
							id="settings-panel-pieces"
							role="tabpanel"
							aria-labelledby="settings-tab-pieces"
							className="flex flex-col gap-4"
						>
							<h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
								Piece Theme
							</h3>
							<div className="grid grid-cols-3 gap-2">
								{Object.entries(PIECE_THEMES).map(([key, theme]) => (
									<button
										key={key}
										type="button"
										className={`relative flex flex-col items-center gap-1.5 rounded-md p-2 transition-colors ${
											settings.pieceTheme === key
												? "bg-zinc-700 ring-1 ring-zinc-500"
												: "bg-zinc-800 hover:bg-zinc-700/50"
										}`}
										onClick={() => updateSettings({ pieceTheme: key })}
									>
										<div className="flex gap-0.5 items-center justify-center h-10">
											{theme.type === "unicode" ? (
												<>
													<span
														className="text-2xl"
														style={{
															color: "#fff",
															filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.3))",
														}}
													>
														{getPieceUnicode("White", "King")}
													</span>
													<span
														className="text-2xl"
														style={{
															color: "#000",
															filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.3))",
														}}
													>
														{getPieceUnicode("Black", "Queen")}
													</span>
												</>
											) : (
												<>
													<img
														src={getPieceImageUrl(key, "White", "King")}
														alt="White King"
														className="h-8 w-8"
														draggable={false}
													/>
													<img
														src={getPieceImageUrl(key, "Black", "Queen")}
														alt="Black Queen"
														className="h-8 w-8"
														draggable={false}
													/>
												</>
											)}
										</div>
										<span className="text-[10px] text-zinc-400">{theme.name}</span>
										{settings.pieceTheme === key && (
											<div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100">
												<Check className="size-2.5 text-zinc-900" />
											</div>
										)}
									</button>
								))}
							</div>
						</section>
					)}

					{activeTab === "play" && (
						<section
							id="settings-panel-play"
							role="tabpanel"
							aria-labelledby="settings-tab-play"
							className="flex flex-col gap-2"
						>
							<ToggleRow
								label="Sound effects"
								checked={settings.soundEnabled}
								onChange={(v) => updateSettings({ soundEnabled: v })}
							/>
							<ToggleRow
								label="Move animation"
								checked={settings.moveAnimation}
								onChange={(v) => updateSettings({ moveAnimation: v })}
							/>
							<ToggleRow
								label="Confirm moves"
								checked={settings.confirmMoves}
								onChange={(v) => updateSettings({ confirmMoves: v })}
							/>
							<ToggleRow
								label="Auto-queen promotion"
								checked={settings.autoQueen}
								onChange={(v) => updateSettings({ autoQueen: v })}
							/>
						</section>
					)}

					{/* Reset */}
					<Button
						variant="outline"
						size="sm"
						className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
						onClick={resetSettings}
					>
						<RotateCcw className="size-3 mr-2" />
						Reset to defaults
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function ToggleRow({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<label className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-zinc-800/50 transition-colors cursor-pointer">
			<span className="text-sm text-zinc-300">{label}</span>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
					checked ? "bg-zinc-100" : "bg-zinc-700"
				}`}
				onClick={() => onChange(!checked)}
			>
				<span
					className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
						checked ? "translate-x-4.5 bg-zinc-900" : "translate-x-0.5 bg-zinc-400"
					}`}
				/>
			</button>
		</label>
	);
}
