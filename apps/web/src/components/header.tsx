import { Camera, ChevronDown, Cpu, LogOut, Settings, Trophy, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import SettingsDialog from "./settings-dialog";

interface HeaderProps {
	onRestart?: (options: {
		mode: "vs_player" | "vs_computer";
		timeControl: number;
		increment?: number;
	}) => void;
	isRestarting?: boolean;
	activeTab?: "vs_player" | "vs_player_online" | "vs_computer";
	currentTimeControl?: number;
	currentIncrement?: number;
	queueStatus?: "idle" | "queued" | "matched";
}

type TimeOption = {
	label: string;
	minutes: number;
	increment: number;
};

const timeCategories: { label: string; options: TimeOption[] }[] = [
	{
		label: "Bullet",
		options: [
			{ label: "1+0", minutes: 1, increment: 0 },
			{ label: "1+1", minutes: 1, increment: 1 },
			{ label: "2+1", minutes: 2, increment: 1 },
		],
	},
	{
		label: "Blitz",
		options: [
			{ label: "3+0", minutes: 3, increment: 0 },
			{ label: "3+2", minutes: 3, increment: 2 },
			{ label: "5+0", minutes: 5, increment: 0 },
			{ label: "5+3", minutes: 5, increment: 3 },
		],
	},
	{
		label: "Rapid",
		options: [
			{ label: "10+0", minutes: 10, increment: 0 },
			{ label: "10+5", minutes: 10, increment: 5 },
			{ label: "15+10", minutes: 15, increment: 10 },
			{ label: "30+0", minutes: 30, increment: 0 },
		],
	},
	{
		label: "Classical",
		options: [
			{ label: "30+20", minutes: 30, increment: 20 },
			{ label: "60+0", minutes: 60, increment: 0 },
		],
	},
];

export default function Header(props: HeaderProps) {
	const [selectedTime, setSelectedTime] = useState(10);
	const [selectedIncrement, setSelectedIncrement] = useState(0);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [profileImageError, setProfileImageError] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { user, signOut, updateProfileImage } = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		if (props.currentTimeControl !== undefined) {
			setSelectedTime(props.currentTimeControl);
		}
		if (props.currentIncrement !== undefined) {
			setSelectedIncrement(props.currentIncrement);
		}
	}, [props.currentTimeControl, props.currentIncrement]);

	const currentTab = props.activeTab || "vs_player";
	const currentMode = currentTab === "vs_computer" ? "vs_computer" : "vs_player";
	const profileImage = user?.image && !profileImageError ? user.image : null;

	useEffect(() => {
		setProfileImageError(false);
	}, [user?.image]);

	const handleSelect = (option: TimeOption) => {
		setSelectedTime(option.minutes);
		setSelectedIncrement(option.increment);
	};

	const getTimeLabel = () => {
		if (selectedTime === 0) return "\u221E Unlimited";
		if (selectedIncrement > 0) return `${selectedTime}+${selectedIncrement}`;
		return `${selectedTime}m`;
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

	const handleProfileImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !file.type.startsWith("image/")) return;

		const image = await resizeProfileImage(file);
		updateProfileImage(image);
	};

	return (
		<>
			<header className="sticky top-0 z-50 flex items-center justify-between bg-zinc-950 px-6 py-2 text-zinc-100 border-b border-zinc-800">
				<Link to="/" className="flex w-1/4 items-center gap-2 transition-opacity hover:opacity-80">
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
							Local
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
							Online
						</Link>
					</div>
				</div>

				<div className="flex w-1/4 items-center justify-end gap-2">
					{currentTab !== "vs_computer" && (
						<DropdownMenu>
							<DropdownMenuTrigger className="cursor-pointer flex items-center h-8 text-xs font-medium bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 rounded-md px-3">
								{getTimeLabel()}
								<ChevronDown className="ml-2 size-3 transition-transform duration-200" />
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-52 bg-zinc-900 border-zinc-800 text-zinc-300">
								{timeCategories.map((category) => (
									<div key={category.label}>
										<DropdownMenuLabel className="text-[10px] font-bold tracking-wider text-zinc-600 uppercase px-2 py-1.5">
											{category.label}
										</DropdownMenuLabel>
										<div className="grid grid-cols-2 gap-1 p-1">
											{category.options.map((option) => {
												const isSelected =
													selectedTime === option.minutes && selectedIncrement === option.increment;
												return (
													<DropdownMenuItem
														key={option.label}
														onClick={() => handleSelect(option)}
														className={`justify-center text-xs font-medium focus:bg-zinc-100 focus:text-zinc-900 ${
															isSelected ? "bg-zinc-100 text-zinc-900" : ""
														}`}
													>
														{option.label}
													</DropdownMenuItem>
												);
											})}
										</div>
										<DropdownMenuSeparator className="bg-zinc-800" />
									</div>
								))}
								<DropdownMenuItem
									onClick={() => {
										setSelectedTime(0);
										setSelectedIncrement(0);
									}}
									className={`justify-center text-xs font-medium focus:bg-zinc-100 focus:text-zinc-900 ${
										selectedTime === 0 ? "bg-zinc-100 text-zinc-900" : ""
									}`}
								>
									\u221E Unlimited
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					<Button
						onClick={() =>
							props.onRestart?.({
								mode: currentMode,
								timeControl: currentTab === "vs_computer" ? 0 : selectedTime,
								increment: currentTab === "vs_computer" ? 0 : selectedIncrement,
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
						{getButtonText()}
					</Button>

					{/* Settings */}
					<button
						type="button"
						className="flex items-center justify-center h-8 w-8 rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
						onClick={() => setSettingsOpen(true)}
					>
						<Settings className="size-3.5" />
					</button>

					{user ? (
						<DropdownMenu>
							<DropdownMenuTrigger className="cursor-pointer flex h-8 shrink-0 items-center text-xs font-medium bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 rounded-md px-1.5 md:px-3">
								<ProfileAvatar
									image={profileImage}
									name={user.name}
									onImageError={() => setProfileImageError(true)}
								/>
								<span className="ml-2 hidden max-w-24 truncate md:inline">{user.name}</span>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-48 bg-zinc-900 border-zinc-800 text-zinc-300">
								<DropdownMenuLabel className="flex items-center gap-2 px-2 py-2">
									<ProfileAvatar
										image={profileImage}
										name={user.name}
										onImageError={() => setProfileImageError(true)}
									/>
									<span className="min-w-0">
										<span className="block truncate text-xs font-medium normal-case tracking-normal text-zinc-100">
											{user.name}
										</span>
										<span className="block truncate text-[10px] font-medium normal-case tracking-normal text-zinc-500">
											{user.email}
										</span>
									</span>
								</DropdownMenuLabel>
								<DropdownMenuSeparator className="bg-zinc-800" />
								<DropdownMenuItem
									onClick={() => fileInputRef.current?.click()}
									className="justify-start text-xs font-medium focus:bg-zinc-100 focus:text-zinc-900 cursor-pointer"
								>
									<Camera className="mr-2 size-3" />
									Upload Photo
								</DropdownMenuItem>
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
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 hover:bg-zinc-800 transition-colors sm:w-auto sm:px-3"
							aria-label="Sign in"
						>
							<User className="size-3 sm:mr-2" />
							<span className="hidden text-xs font-medium sm:inline">Sign In</span>
						</Link>
					)}
				</div>
			</header>
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={(event) => void handleProfileImageChange(event)}
			/>

			<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
		</>
	);
}

function ProfileAvatar({
	image,
	name,
	onImageError,
}: {
	image: string | null;
	name: string;
	onImageError: () => void;
}) {
	if (image) {
		return (
			<img
				src={image}
				alt=""
				className="size-5 rounded-full object-cover"
				onError={onImageError}
			/>
		);
	}

	return (
		<span className="flex size-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold uppercase text-zinc-200">
			{name.trim().charAt(0) || <User className="size-3" />}
		</span>
	);
}

async function resizeProfileImage(file: File) {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error("Could not read image"));
		reader.readAsDataURL(file);
	});

	const image = await new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Could not load image"));
		img.src = dataUrl;
	});

	const size = 160;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext("2d");
	if (!context) return dataUrl;

	const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
	const sourceX = (image.naturalWidth - sourceSize) / 2;
	const sourceY = (image.naturalHeight - sourceSize) / 2;
	context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

	return canvas.toDataURL("image/jpeg", 0.85);
}
