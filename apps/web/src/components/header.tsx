import { ChevronDown, Cpu, LogOut, Trophy, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";

interface HeaderProps {
	onRestart?: (options: { mode: "vs_player" | "vs_computer"; timeControl: number }) => void;
	isRestarting?: boolean;
	activeTab?: "vs_player" | "vs_player_online" | "vs_computer";
	currentTimeControl?: number;
	queueStatus?: "idle" | "queued" | "matched";
}

const timeCategories = [
	{ label: "Bullet", options: [1] },
	{ label: "Blitz", options: [3, 5] },
	{ label: "Rapid", options: [10, 30] },
	{ label: "Tournament", options: [60] },
];

export default function Header(props: HeaderProps) {
	const [selectedTime, setSelectedTime] = useState(10);
	const { user, signOut } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		if (props.currentTimeControl !== undefined) {
			setSelectedTime(props.currentTimeControl);
		}
	}, [props.currentTimeControl]);

	const currentTab = props.activeTab || "vs_player";
	const currentMode = currentTab === "vs_computer" ? "vs_computer" : "vs_player";

	const handleSelect = (timeControl: number) => {
		setSelectedTime(timeControl);
	};

	const getButtonText = () => {
		if (props.isRestarting) return "Starting...";
		if (currentTab === "vs_player_online") {
			if (props.queueStatus === "queued") return "Searching...";
			return "Find Match";
		}
		if (currentTab === "vs_player") return "New Game";
		return "New Game";
	};

	return (
		<header className="sticky top-0 z-50 flex items-center justify-between bg-zinc-950 px-6 py-2 text-zinc-100 border-b border-zinc-800">
			<Link to="/" className="flex w-1/4 items-center gap-2 transition-opacity hover:opacity-80">
				<span className="text-2xl">♛</span>
				<h1 className="text-xl font-medium tracking-tight lowercase">chess</h1>
			</Link>

			<div className="flex flex-1 items-center justify-center">
				<div className="flex items-center rounded-full bg-zinc-900 p-1">
					<Link
						to="/computer"
						className={`flex items-center rounded-full px-4 h-7 text-xs font-medium transition-colors ${
							currentTab === "vs_computer"
								? "bg-zinc-700 text-zinc-100"
								: "text-zinc-400 hover:text-zinc-100"
						}`}
					>
						<Cpu className="mr-2 size-3" />
						Computer
					</Link>
					<Link
						to="/"
						className={`flex items-center rounded-full px-4 h-7 text-xs font-medium transition-colors ${
							currentTab === "vs_player"
								? "bg-zinc-700 text-zinc-100"
								: "text-zinc-400 hover:text-zinc-100"
						}`}
					>
						<User className="mr-2 size-3" />
						Vs Player
					</Link>
					<Link
						to="/online"
						className={`flex items-center rounded-full px-4 h-7 text-xs font-medium transition-colors ${
							currentTab === "vs_player_online"
								? "bg-zinc-700 text-zinc-100"
								: "text-zinc-400 hover:text-zinc-100"
						}`}
					>
						<Trophy className="mr-2 size-3" />
						Vs Player Online
					</Link>
				</div>
			</div>

			<div className="flex w-1/4 items-center justify-end gap-3">
				{currentTab !== "vs_computer" && (
					<DropdownMenu>
						<DropdownMenuTrigger className="cursor-pointer">
							<button
								type="button"
								className="flex items-center h-8 text-xs font-medium bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 rounded-md px-3"
							>
								{selectedTime === 0 ? "∞ Unlimited" : `${selectedTime}m`}
								<ChevronDown className="ml-2 size-3 transition-transform duration-200" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-48 bg-zinc-900 border-zinc-800 text-zinc-300">
							{timeCategories.map((category) => (
								<div key={category.label}>
									<DropdownMenuLabel className="text-[10px] font-bold tracking-wider text-zinc-600 uppercase px-2 py-1.5">
										{category.label}
									</DropdownMenuLabel>
									<div className="grid grid-cols-2 gap-1 p-1">
										{category.options.map((option) => (
											<DropdownMenuItem
												key={option}
												onClick={() => handleSelect(option)}
												className={`justify-center text-xs font-medium focus:bg-zinc-100 focus:text-zinc-900 ${
													selectedTime === option ? "bg-zinc-100 text-zinc-900" : ""
												}`}
											>
												{option}m
											</DropdownMenuItem>
										))}
									</div>
									<DropdownMenuSeparator className="bg-zinc-800" />
								</div>
							))}
							<DropdownMenuItem
								onClick={() => handleSelect(0)}
								className={`justify-center text-xs font-medium focus:bg-zinc-100 focus:text-zinc-900 ${
									selectedTime === 0 ? "bg-zinc-100 text-zinc-900" : ""
								}`}
							>
								∞ Unlimited
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}

				<Button
					onClick={() =>
						props.onRestart?.({
							mode: currentMode,
							timeControl: currentTab === "vs_computer" ? 0 : selectedTime,
						})
					}
					disabled={props.isRestarting || props.queueStatus === "queued"}
					variant={props.queueStatus === "queued" ? "secondary" : "default"}
					size="sm"
					className={`h-8 text-xs font-medium ${
						props.queueStatus === "queued"
							? "animate-pulse"
							: "bg-zinc-100 text-zinc-900 hover:bg-white"
					}`}
				>
					{props.queueStatus === "queued" && (
						<div className="mr-2 h-2 w-2 animate-spin rounded-full border border-zinc-400 border-t-transparent" />
					)}
					<Trophy className="mr-2 size-3" />
					{getButtonText()}
				</Button>

				{user ? (
					<DropdownMenu>
						<DropdownMenuTrigger className="cursor-pointer">
							<button
								type="button"
								className="flex items-center h-8 text-xs font-medium bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 rounded-md px-3"
							>
								<User className="mr-2 size-3" />
								{user.name}
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-48 bg-zinc-900 border-zinc-800 text-zinc-300">
							<DropdownMenuLabel className="text-[10px] font-bold tracking-wider text-zinc-600 uppercase px-2 py-1.5">
								{user.email}
							</DropdownMenuLabel>
							<DropdownMenuSeparator className="bg-zinc-800" />
							<DropdownMenuItem
								onClick={async () => {
									await signOut();
									navigate("/sign-in");
								}}
								className="justify-start text-xs font-medium focus:bg-zinc-100 focus:text-zinc-900 cursor-pointer"
							>
								<LogOut className="mr-2 size-3" />
								Sign Out
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<Link
						to="/sign-in"
						className="flex items-center rounded-full px-4 h-8 text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-100 hover:bg-zinc-800 transition-colors"
					>
						<User className="mr-2 size-3" />
						Sign In
					</Link>
				)}
			</div>
		</header>
	);
}
