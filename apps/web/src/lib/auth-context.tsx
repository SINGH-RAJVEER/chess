import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { AuthResponse } from "./api";

type AuthState = {
	user: AuthResponse["user"] | null;
	session: AuthResponse["session"] | null;
	isLoading: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (email: string, password: string, name: string) => Promise<void>;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthResponse["user"] | null>(null);
	const [session, setSession] = useState<AuthResponse["session"] | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const storedUser = localStorage.getItem("chess_user");
		const storedSession = localStorage.getItem("chess_session");

		if (storedUser && storedSession) {
			setUser(JSON.parse(storedUser));
			setSession(JSON.parse(storedSession));
		}
		setIsLoading(false);
	}, []);

	const signIn = async (email: string, password: string) => {
		const response = await fetch("/api/auth/sign-in", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || "Failed to sign in");
		}

		const data = (await response.json()) as AuthResponse;
		setUser(data.user);
		setSession(data.session);
		localStorage.setItem("chess_user", JSON.stringify(data.user));
		localStorage.setItem("chess_session", JSON.stringify(data.session));
	};

	const signUp = async (email: string, password: string, name: string) => {
		const response = await fetch("/api/auth/sign-up", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password, name }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || "Failed to sign up");
		}

		const data = (await response.json()) as AuthResponse;
		setUser(data.user);
		setSession(data.session);
		localStorage.setItem("chess_user", JSON.stringify(data.user));
		localStorage.setItem("chess_session", JSON.stringify(data.session));
	};

	const signOut = async () => {
		if (session) {
			await fetch("/api/auth/sign-out", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId: session.id }),
			});
		}
		setUser(null);
		setSession(null);
		localStorage.removeItem("chess_user");
		localStorage.removeItem("chess_session");
	};

	return (
		<AuthContext.Provider value={{ user, session, isLoading, signIn, signUp, signOut }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
