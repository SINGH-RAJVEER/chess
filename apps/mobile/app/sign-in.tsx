import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../src/lib/auth";

export default function SignInScreen() {
	const router = useRouter();
	const { signIn } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const handleSubmit = async () => {
		if (pending) return;
		setError(null);
		setPending(true);
		try {
			await signIn(email.trim(), password);
			router.replace("/");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to sign in");
		} finally {
			setPending(false);
		}
	};

	return (
		<View className="flex-1 bg-zinc-950 px-6 pt-10">
			<Text className="text-2xl font-light text-zinc-50">Sign in</Text>

			<Text className="mt-6 mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
				Email
			</Text>
			<TextInput
				value={email}
				onChangeText={setEmail}
				autoCapitalize="none"
				autoCorrect={false}
				keyboardType="email-address"
				textContentType="emailAddress"
				placeholder="you@example.com"
				placeholderTextColor="#52525b"
				className="rounded-lg border border-zinc-800 px-4 py-3 text-base text-zinc-100"
			/>

			<Text className="mt-4 mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
				Password
			</Text>
			<TextInput
				value={password}
				onChangeText={setPassword}
				secureTextEntry
				textContentType="password"
				placeholder="Your password"
				placeholderTextColor="#52525b"
				className="rounded-lg border border-zinc-800 px-4 py-3 text-base text-zinc-100"
			/>

			{error ? <Text className="mt-3 text-sm text-red-400">{error}</Text> : null}

			<Pressable
				onPress={() => void handleSubmit()}
				disabled={pending}
				className="mt-6 rounded-lg bg-zinc-100 py-3.5 items-center active:bg-white"
			>
				{pending ? (
					<ActivityIndicator color="#09090b" />
				) : (
					<Text className="text-base font-semibold text-zinc-900">Sign in</Text>
				)}
			</Pressable>

			<Link href="/sign-up" asChild>
				<Pressable className="mt-4 items-center">
					<Text className="text-sm text-zinc-400">
						No account yet? <Text className="text-zinc-100 underline">Sign up</Text>
					</Text>
				</Pressable>
			</Link>
		</View>
	);
}
