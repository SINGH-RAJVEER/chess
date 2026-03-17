import { Hono } from "hono";
import { auth } from "../lib/auth";

const authRouter = new Hono();

authRouter.post("/sign-up", async (c) => {
	const body = await c.req.json();
	const { email, password, name } = body;

	if (!email || !password || !name) {
		return c.json({ error: "Email, password, and name are required" }, 400);
	}

	try {
		const user = await auth.api.signUpEmail({
			headers: c.req.header(),
			body: { email, password, name },
		});
		return c.json(user);
	} catch (error: unknown) {
		const err = error as { message?: string };
		return c.json({ error: err.message || "Sign up failed" }, 400);
	}
});

authRouter.post("/sign-in", async (c) => {
	const body = await c.req.json();
	const { email, password } = body;

	if (!email || !password) {
		return c.json({ error: "Email and password are required" }, 400);
	}

	try {
		const session = await auth.api.signInEmail({
			headers: c.req.header(),
			body: { email, password },
		});
		return c.json(session);
	} catch (error: unknown) {
		const err = error as { message?: string };
		return c.json({ error: err.message || "Invalid credentials" }, 401);
	}
});

authRouter.post("/sign-out", async (c) => {
	const body = await c.req.json();
	const { sessionId } = body;

	if (!sessionId) {
		return c.json({ error: "Session ID is required" }, 400);
	}

	try {
		await auth.api.signOut({
			headers: { cookie: `session_token=${sessionId}` },
		});
		return c.json({ success: true });
	} catch (error: unknown) {
		const err = error as { message?: string };
		return c.json({ error: err.message || "Sign out failed" }, 400);
	}
});

authRouter.get("/session", async (c) => {
	const sessionId = c.req.query("sessionId");

	if (!sessionId) {
		return c.json({ error: "Session ID is required" }, 400);
	}

	try {
		const session = await auth.api.getSession({
			headers: { cookie: `session_token=${sessionId}` },
		});
		return c.json(session);
	} catch {
		return c.json({ session: null, user: null });
	}
});

export default authRouter;
