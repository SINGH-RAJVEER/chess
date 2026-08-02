import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { AuthResponse } from "./api";

type AuthState = {
	user: AuthResponse["user"] | null;
	session: AuthResponse["session"] | null;
	isLoading: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (email: string, password: string, name: string) => Promise<void>;
	signOut: () => Promise<void>;
	updateProfileImage: (image: string) => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function isAuthResponse(value: unknown): value is AuthResponse {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<AuthResponse>;
	return Boolean(candidate.user?.id && candidate.session?.id);
}

function getProfileImageKey(userId: string) {
	return `chess_profile_image_${userId}`;
}

function applyProfileImageOverride(user: AuthResponse["user"]) {
	const storedImage = localStorage.getItem(getProfileImageKey(user.id));
	return storedImage ? { ...user, image: storedImage } : user;
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
					setUser(applyProfileImageOverride(JSON.parse(storedUser)));
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
					const userWithImage = applyProfileImageOverride(data.user);
					setUser(userWithImage);
					setSession(data.session);
					localStorage.setItem("chess_user", JSON.stringify(userWithImage));
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
		const userWithImage = applyProfileImageOverride(data.user);
		setUser(userWithImage);
		setSession(data.session);
		localStorage.setItem("chess_user", JSON.stringify(userWithImage));
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
		const userWithImage = applyProfileImageOverride(data.user);
		setUser(userWithImage);
		setSession(data.session);
		localStorage.setItem("chess_user", JSON.stringify(userWithImage));
		localStorage.setItem("chess_session", JSON.stringify(data.session));
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

	const updateProfileImage = (image: string) => {
		setUser((currentUser) => {
			if (!currentUser) return currentUser;
			const updatedUser = { ...currentUser, image };
			localStorage.setItem(getProfileImageKey(currentUser.id), image);
			localStorage.setItem("chess_user", JSON.stringify(updatedUser));
			return updatedUser;
		});
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				session,
				isLoading,
				signIn,
				signUp,
				signOut,
				updateProfileImage,
			}}
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
