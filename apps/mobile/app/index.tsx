import type { ComputerOpponent, StockfishLevel } from "@sixtyfour/types";
import { DEFAULT_STOCKFISH_LEVEL, STOCKFISH_LEVELS } from "@sixtyfour/types";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { getApiBaseUrlForDisplay } from "../src/lib/api";
import { useAuth } from "../src/lib/auth";

const OPPONENT_KEY = "sixtyfour_computer_opponent";
const LEVEL_KEY = "sixtyfour_computer_level";

function MenuButton({ label, onPress }: { label: string; onPress: () => void }) {
	return (
		<Pressable
			onPress={onPress}
			className="w-full rounded-lg bg-zinc-100 py-3.5 items-center active:bg-white"
		>
			<Text className="text-base font-semibold text-zinc-900">{label}</Text>
		</Pressable>
	);
}

export default function HomeScreen() {
	const router = useRouter();
	const { user, isLoading, signOut } = useAuth();
	const [opponent, setOpponent] = useState<ComputerOpponent>("minimax");
	const [level, setLevel] = useState<StockfishLevel>(DEFAULT_STOCKFISH_LEVEL);
	const [signingOut, setSigningOut] = useState(false);

	const pickOpponent = async (next: ComputerOpponent) => {
		setOpponent(next);
		await SecureStore.setItemAsync(OPPONENT_KEY, next).catch(() => undefined);
	};

	const pickLevel = async (next: StockfishLevel) => {
		setLevel(next);
		await SecureStore.setItemAsync(LEVEL_KEY, String(next)).catch(() => undefined);
	};

	const computerRoute =
		opponent === "stockfish"
			? `/game?mode=computer&opponent=stockfish&level=${level}`
			: `/game?mode=computer&opponent=${opponent}`;

	const handleSignOut = async () => {
		setSigningOut(true);
		try {
			await signOut();
		} finally {
			setSigningOut(false);
		}
	};

	return (
		<View className="flex-1 bg-zinc-950 px-6 pt-10 pb-8">
			<Text className="text-4xl font-light text-zinc-50">SixtyFour</Text>
			<Text className="mt-1 text-sm text-zinc-500">Local, computer and online play</Text>

			<View className="mt-8 gap-3">
				<MenuButton label="Play locally" onPress={() => router.push("/game?mode=local")} />
				<MenuButton label="Play the computer" onPress={() => router.push(computerRoute)} />
				<MenuButton label="Play online" onPress={() => router.push("/game?mode=online")} />
			</View>

			<View className="mt-6">
				<Text className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
					Computer opponent
				</Text>
				<View className="flex-row rounded-lg border border-zinc-800 p-1">
					{(
						[
							["minimax", "Default"],
							["stockfish", "Stockfish"],
						] as const
					).map(([value, label]) => (
						<Pressable
							key={value}
							onPress={() => void pickOpponent(value)}
							accessibilityState={{ selected: opponent === value }}
							className={`flex-1 rounded-md py-2 items-center ${
								opponent === value ? "bg-violet-500/80" : ""
							}`}
						>
							<Text
								className={`text-sm font-medium ${opponent === value ? "text-white" : "text-zinc-400"}`}
							>
								{label}
							</Text>
						</Pressable>
					))}
				</View>
				{opponent === "stockfish" ? (
					<View className="mt-3">
						<Text className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
							Stockfish level
						</Text>
						<View className="flex-row rounded-lg border border-zinc-800 p-1">
							{STOCKFISH_LEVELS.map((value) => (
								<Pressable
									key={value}
									onPress={() => void pickLevel(value)}
									accessibilityLabel={`Level ${value}`}
									accessibilityState={{ selected: level === value }}
									className={`flex-1 rounded-md py-2 items-center ${
										level === value ? "bg-violet-500/80" : ""
									}`}
								>
									<Text
										className={`text-sm font-medium ${level === value ? "text-white" : "text-zinc-400"}`}
									>
										{value}
									</Text>
								</Pressable>
							))}
						</View>
					</View>
				) : null}
			</View>

			<View className="mt-auto gap-3">
				{isLoading ? (
					<ActivityIndicator color="#fafafa" />
				) : user ? (
					<View className="gap-3">
						<Text className="text-center text-sm text-zinc-400">Signed in as {user.email}</Text>
						<Pressable
							onPress={() => void handleSignOut()}
							disabled={signingOut}
							className="w-full rounded-lg border border-zinc-700 py-3 items-center"
						>
							<Text className="text-sm font-medium text-zinc-200">
								{signingOut ? "Signing out..." : "Sign out"}
							</Text>
						</Pressable>
					</View>
				) : (
					<View className="flex-row gap-3">
						<Pressable
							onPress={() => router.push("/sign-in")}
							className="flex-1 rounded-lg border border-zinc-700 py-3 items-center"
						>
							<Text className="text-sm font-medium text-zinc-200">Sign in</Text>
						</Pressable>
						<Pressable
							onPress={() => router.push("/sign-up")}
							className="flex-1 rounded-lg border border-zinc-700 py-3 items-center"
						>
							<Text className="text-sm font-medium text-zinc-200">Sign up</Text>
						</Pressable>
					</View>
				)}
				<Text className="text-center text-xs text-zinc-600">API: {getApiBaseUrlForDisplay()}</Text>
			</View>
		</View>
	);
}
