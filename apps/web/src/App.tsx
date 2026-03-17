import { Route, Routes } from "react-router-dom";
import ComputerPage from "./pages/computer-page";
import HomePage from "./pages/home-page";
import NotFoundPage from "./pages/not-found-page";
import OnlinePlayerPage from "./pages/online-player-page";
import SignInPage from "./pages/sign-in-page";
import SignUpPage from "./pages/sign-up-page";

export default function App() {
	return (
		<Routes>
			<Route path="/sign-in" element={<SignInPage />} />
			<Route path="/sign-up" element={<SignUpPage />} />
			<Route path="/" element={<HomePage />} />
			<Route path="/online" element={<OnlinePlayerPage />} />
			<Route path="/computer" element={<ComputerPage />} />
			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}
