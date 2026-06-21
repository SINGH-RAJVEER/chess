import { db, schema } from "@chess/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const authBaseUrl = process.env.BETTER_AUTH_URL || "http://localhost:4000/api/auth";
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";
const authOrigin = new URL(authBaseUrl).origin;

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
	baseURL: authBaseUrl,
	trustedOrigins: [webOrigin, authOrigin],
	...(googleClientId && googleClientSecret
		? {
				socialProviders: {
					google: {
						clientId: googleClientId,
						clientSecret: googleClientSecret,
					},
				},
			}
		: {}),
});

export type Auth = typeof auth;
