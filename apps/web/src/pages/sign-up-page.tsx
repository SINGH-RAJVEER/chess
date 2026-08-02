import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "../lib/auth-context";

export default function SignUpPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isGoogleLoading, setIsGoogleLoading] = useState(false);
	const { signUp, signInWithGoogle } = useAuth();
	const navigate = useNavigate();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setIsLoading(true);

		try {
			await signUp(email, password, name);
			navigate("/");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to sign up");
		} finally {
			setIsLoading(false);
		}
	};

	const handleGoogleSignIn = async () => {
		setError(null);
		setIsGoogleLoading(true);
		try {
			await signInWithGoogle();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to continue with Google");
			setIsGoogleLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
			<Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
				<CardHeader>
					<Button
						type="button"
						variant="ghost"
						onClick={() => navigate("/")}
						className="-ml-3 w-fit text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
					>
						<ArrowLeft className="size-4" />
						Back to chess
					</Button>
					<CardTitle className="text-zinc-100">Create Account</CardTitle>
					<CardDescription className="text-zinc-400">Sign up for a new account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<div className="p-3 text-sm bg-red-500/10 border border-red-500/20 rounded-md text-red-400">
								{error}
							</div>
						)}
						<div className="space-y-2">
							<label htmlFor="name" className="text-sm text-zinc-300">
								Name
							</label>
							<Input
								id="name"
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Your name"
								required
								className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
							/>
						</div>
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
								minLength={8}
								className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
							/>
						</div>
						<Button
							type="submit"
							disabled={isLoading || isGoogleLoading}
							className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
						>
							{isLoading ? "Creating account..." : "Sign Up"}
						</Button>
						<div className="relative py-1">
							<div className="absolute inset-0 flex items-center">
								<span className="w-full border-t border-zinc-800" />
							</div>
							<div className="relative flex justify-center text-xs uppercase">
								<span className="bg-zinc-900 px-2 text-zinc-500">Or</span>
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							disabled={isLoading || isGoogleLoading}
							onClick={handleGoogleSignIn}
							className="w-full border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
						>
							<span className="font-semibold text-blue-400">G</span>
							{isGoogleLoading ? "Redirecting..." : "Continue with Google"}
						</Button>
						<p className="text-center text-sm text-zinc-400">
							Already have an account?{" "}
							<button
								type="button"
								onClick={() => navigate("/sign-in")}
								className="text-indigo-400 hover:underline"
							>
								Sign in
							</button>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
