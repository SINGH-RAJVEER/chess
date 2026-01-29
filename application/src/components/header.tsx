import {
	type Component,
	createSignal,
	createEffect,
	Show,
	For,
} from "solid-js";
import { Link } from "@tanstack/solid-router";

interface HeaderProps {
	onRestart?: (options: {
		mode: "vs_player" | "vs_computer";
		timeControl: number;
	}) => void;
	isRestarting?: boolean;
	activeMode?: "vs_player" | "vs_computer";
	currentTimeControl?: number;
}

const Header: Component<HeaderProps> = (props) => {
	const [isOpen, setIsOpen] = createSignal(false);
	const [selectedTime, setSelectedTime] = createSignal(10);

	// Sync with prop
	createEffect(() => {
		if (props.currentTimeControl !== undefined) {
			setSelectedTime(props.currentTimeControl);
		}
	});

	const timeCategories = [
		{ label: "Bullet", options: [1] },
		{ label: "Blitz", options: [3, 5] },
		{ label: "Rapid", options: [10, 30] },
		{ label: "Tournament", options: [60] },
	];

	const handleSelect = (t: number) => {
		setSelectedTime(t);
		setIsOpen(false);
	};

	const currentMode = () => props.activeMode || "vs_player";

	const toggleDropdown = (e: MouseEvent) => {
		e.stopPropagation();
		setIsOpen(!isOpen());
	};

	return (
		<header class="bg-stone-900 text-white shadow-md px-6 py-3 sticky top-0 z-50 flex items-center justify-between">
			{/* Logo */}
			<Link
				to="/"
				class="flex items-center gap-3 w-1/4 hover:opacity-90 transition-opacity"
			>
				<span class="text-3xl">♛</span>
				<h1 class="text-2xl font-black tracking-tighter uppercase hidden sm:block">
					Chess<span class="text-indigo-500">Master</span>
				</h1>
			</Link>

			{/* Mode Tabs */}
			<div class="flex items-center justify-center flex-1">
				<div class="bg-stone-800 p-1 rounded-lg flex items-center shadow-inner">
					<Link
						to="/computer"
						class={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
							currentMode() === "vs_computer"
								? "bg-indigo-600 text-white shadow-md"
								: "text-stone-400 hover:text-stone-200"
						}`}
					>
						Vs Computer
					</Link>
					<Link
						to="/"
						class={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
							currentMode() === "vs_player"
								? "bg-indigo-600 text-white shadow-md"
								: "text-stone-400 hover:text-stone-200"
						}`}
					>
						Vs Player
					</Link>
				</div>
			</div>

			{/* Controls */}
			<div class="flex items-center gap-3 justify-end w-1/4">
				{/* Custom Time Control Dropdown */}
				<div class="relative">
					<button
						onClick={toggleDropdown}
						class="flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-bold py-2 pl-4 pr-3 rounded-lg border border-stone-700 hover:border-indigo-500 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[100px] justify-between"
					>
						<span>
							{selectedTime() === 0 ? "∞ Unlimited" : `${selectedTime()} min`}
						</span>
						<svg
							class={`w-4 h-4 transition-transform ${isOpen() ? "rotate-180" : ""}`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>

					<Show when={isOpen()}>
						<div
							class="fixed inset-0 z-10 cursor-default"
							onClick={() => setIsOpen(false)}
						/>
						<div class="absolute right-0 mt-2 w-56 bg-stone-800 rounded-xl shadow-xl border border-stone-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right">
							<div class="max-h-[80vh] overflow-y-auto py-1">
								<For each={timeCategories}>
									{(category) => (
										<div class="p-2">
											<div class="text-xs font-bold text-stone-500 uppercase tracking-wider px-2 mb-1">
												{category.label}
											</div>
											<div class="grid grid-cols-2 gap-1">
												<For each={category.options}>
													{(option) => (
														<button
															onClick={() => handleSelect(option)}
															class={`text-sm font-bold py-2 px-3 rounded-md transition-colors text-center ${
																selectedTime() === option
																	? "bg-indigo-600 text-white"
																	: "text-stone-300 hover:bg-stone-700 hover:text-white"
															}`}
														>
															{option} min
														</button>
													)}
												</For>
											</div>
										</div>
									)}
								</For>
								<div class="p-2 border-t border-stone-700">
									<button
										onClick={() => handleSelect(0)}
										class={`w-full text-sm font-bold py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-2 ${
											selectedTime() === 0
												? "bg-indigo-600 text-white"
												: "text-stone-300 hover:bg-stone-700 hover:text-white"
										}`}
									>
										<span>∞</span> Unlimited
									</button>
								</div>
							</div>
						</div>
					</Show>
				</div>

				<button
					type="button"
					onClick={() =>
						props.onRestart?.({
							mode: currentMode(),
							timeControl: selectedTime(),
						})
					}
					disabled={props.isRestarting}
					class="bg-stone-100 hover:bg-white text-stone-900 font-bold py-2 px-4 rounded-lg transition-all uppercase tracking-wider text-xs border border-stone-200 shadow-lg disabled:opacity-50 hover:scale-105 active:scale-95"
				>
					{props.isRestarting ? "Starting..." : "New Game"}
				</button>
			</div>
		</header>
	);
};

export default Header;
