import { db, schema } from "@chess/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: schema.users,
			session: schema.sessions,
			verification: schema.verifications,
			account: schema.accounts,
		},
	}),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
	},
	secret: process.env.BETTER_AUTH_SECRET || "default-secret-change-me",
	baseURL: process.env.BETTER_AUTH_URL || "http://localhost:8000/api/auth",
});

export type Auth = typeof auth;
