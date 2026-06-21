import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { AuthResponse } from "./api";

type AuthState = {
	user: AuthResponse["user"] | null;
	session: AuthResponse["session"] | null;
	isLoading: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (email: string, password: string, name: string) => Promise<void>;
	signInWithGoogle: () => Promise<void>;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function isAuthResponse(value: unknown): value is AuthResponse {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<AuthResponse>;
	return Boolean(candidate.user?.id && candidate.session?.id);
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthResponse["user"] | null>(null);
	const [session, setSession] = useState<AuthResponse["session"] | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let isMounted = true;

		const loadStoredSession = () => {
			try {
				const storedUser = localStorage.getItem("chess_user");
				const storedSession = localStorage.getItem("chess_session");
				if (storedUser && storedSession) {
					setUser(JSON.parse(storedUser));
					setSession(JSON.parse(storedSession));
				}
			} catch {
				localStorage.removeItem("chess_user");
				localStorage.removeItem("chess_session");
			}
		};

		const loadSession = async () => {
			try {
				const response = await fetch("/api/auth/get-session", {
					credentials: "include",
				});
				const data = response.ok ? await response.json() : null;
				if (isMounted && isAuthResponse(data)) {
					setUser(data.user);
					setSession(data.session);
					localStorage.setItem("chess_user", JSON.stringify(data.user));
					localStorage.setItem("chess_session", JSON.stringify(data.session));
					return;
				}
				if (isMounted) loadStoredSession();
			} catch {
				if (isMounted) loadStoredSession();
			} finally {
				if (isMounted) setIsLoading(false);
			}
		};

		void loadSession();

		return () => {
			isMounted = false;
		};
	}, []);

	const signIn = async (email: string, password: string) => {
		const response = await fetch("/api/auth/sign-in", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
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
			credentials: "include",
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

	const signInWithGoogle = async () => {
		const response = await fetch("/api/auth/sign-in/social", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({
				provider: "google",
				callbackURL: window.location.origin,
			}),
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: "Failed to sign in with Google" }));
			throw new Error(error.error || error.message || "Failed to sign in with Google");
		}

		const data = (await response.json()) as { url?: string };
		if (!data.url) {
			throw new Error("Google sign-in did not return a redirect URL");
		}

		window.location.href = data.url;
	};

	const signOut = async () => {
		await fetch("/api/auth/sign-out", {
			method: "POST",
			credentials: "include",
		}).catch(() => undefined);
		setUser(null);
		setSession(null);
		localStorage.removeItem("chess_user");
		localStorage.removeItem("chess_session");
	};

	return (
		<AuthContext.Provider
			value={{ user, session, isLoading, signIn, signUp, signInWithGoogle, signOut }}
		>
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
