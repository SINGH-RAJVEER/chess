import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/lib/auth";

export default function RootLayout() {
	return (
		<SafeAreaProvider>
			<AuthProvider>
				<StatusBar style="light" />
				<Stack
					screenOptions={{
						headerStyle: { backgroundColor: "#09090b" },
						headerTintColor: "#fafafa",
						headerTitleStyle: { fontWeight: "600" },
						contentStyle: { backgroundColor: "#09090b" },
					}}
				>
					<Stack.Screen name="index" options={{ title: "SixtyFour" }} />
					<Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
					<Stack.Screen name="sign-up" options={{ title: "Create account" }} />
					<Stack.Screen name="game" options={{ title: "Game" }} />
				</Stack>
			</AuthProvider>
		</SafeAreaProvider>
	);
}
