import type { AuthResponse } from "@sixtyfour/types";
import * as SecureStore from "expo-secure-store";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { signIn as apiSignIn, signOut as apiSignOut, signUp as apiSignUp, getSession } from "./api";

const USER_KEY = "sixtyfour_user";

type AuthState = {
	user: AuthResponse["user"] | null;
	isLoading: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (email: string, password: string, name: string) => Promise<void>;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthResponse["user"] | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let isMounted = true;

		const restore = async () => {
			try {
				const [storedUser, session] = await Promise.all([
					SecureStore.getItemAsync(USER_KEY),
					getSession(),
				]);
				if (!isMounted) return;
				if (session) {
					setUser(session.user);
					await SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)).catch(
						() => undefined,
					);
				} else if (storedUser) {
					setUser(JSON.parse(storedUser));
				}
			} catch {
				// Start signed out when storage or the API is unreachable.
			} finally {
				if (isMounted) setIsLoading(false);
			}
		};

		void restore();

		return () => {
			isMounted = false;
		};
	}, []);

	const signIn = useCallback(async (email: string, password: string) => {
		const data = await apiSignIn(email, password);
		setUser(data.user);
		await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user)).catch(() => undefined);
	}, []);

	const signUp = useCallback(async (email: string, password: string, name: string) => {
		const data = await apiSignUp(email, password, name);
		setUser(data.user);
		await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user)).catch(() => undefined);
	}, []);

	const signOut = useCallback(async () => {
		await apiSignOut();
		setUser(null);
		await SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined);
	}, []);

	const value = useMemo(
		() => ({ user, isLoading, signIn, signUp, signOut }),
		[user, isLoading, signIn, signUp, signOut],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
