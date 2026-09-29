export type AuthUser = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	emailVerified: boolean;
	createdAt: string;
	updatedAt: string;
};

export type AuthSession = {
	id: string;
	expiresAt: string;
	token: string;
	createdAt: string;
	updatedAt: string;
	ipAddress: string | null;
	userAgent: string | null;
	userId: string;
};

export type AuthResponse = {
	user: AuthUser;
	session: AuthSession;
};
