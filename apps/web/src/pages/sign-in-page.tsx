import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "../lib/auth-context";

export default function SignInPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const { signIn } = useAuth();
	const navigate = useNavigate();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setIsLoading(true);

		try {
			await signIn(email, password);
			navigate("/");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to sign in");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
			<Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
				<CardHeader>
					<CardTitle className="text-zinc-100">Sign In</CardTitle>
					<CardDescription className="text-zinc-400">
						Enter your credentials to access your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<div className="p-3 text-sm bg-red-500/10 border border-red-500/20 rounded-md text-red-400">
								{error}
							</div>
						)}
						<div className="space-y-2">
							<label htmlFor="email" className="text-sm text-zinc-300">
								Email
							</label>
							<Input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="you@example.com"
								required
								className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="password" className="text-sm text-zinc-300">
								Password
							</label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								required
								className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
							/>
						</div>
						<Button
							type="submit"
							disabled={isLoading}
							className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
						>
							{isLoading ? "Signing in..." : "Sign In"}
						</Button>
						<p className="text-center text-sm text-zinc-400">
							Don't have an account?{" "}
							<button
								type="button"
								onClick={() => navigate("/sign-up")}
								className="text-indigo-400 hover:underline"
							>
								Sign up
							</button>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
