import { type Component, createSignal } from "solid-js";
import { Link } from "@tanstack/solid-router";

interface HeaderProps {
  onRestart?: (options: {
    mode: "vs_player" | "vs_computer";
    timeControl: number;
  }) => void;
  isRestarting?: boolean;
  activeMode?: "vs_player" | "vs_computer";
}

const Header: Component<HeaderProps> = (props) => {
  const [timeControl, setTimeControl] = createSignal<number>(10);
  const timeOptions = [1, 3, 5, 10, 30, 0];
  
  // Use activeMode prop or default to vs_player
  const currentMode = () => props.activeMode || "vs_player";

  return (
    <header class="bg-stone-900 text-white shadow-md px-6 py-3 sticky top-0 z-50 flex items-center justify-between">
      {/* Logo */}
      <Link to="/" class="flex items-center gap-3 w-1/4 hover:opacity-90 transition-opacity">
        <span class="text-3xl">♛</span>
        <h1 class="text-2xl font-black tracking-tighter uppercase hidden sm:block">
          Chess<span class="text-indigo-500">Master</span>
        </h1>
      </Link>

      {/* Mode Tabs */}
      <div class="flex items-center justify-center flex-1">
        <div class="bg-stone-800 p-1 rounded-lg flex items-center shadow-inner">
          <Link
            to="/computer"
            class={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
              currentMode() === "vs_computer"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Vs Computer
          </Link>
          <Link
            to="/"
            class={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
              currentMode() === "vs_player"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Vs Player
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div class="flex items-center gap-3 justify-end w-1/4">
        <div class="relative">
          <select
            value={timeControl()}
            onChange={(e) => setTimeControl(Number(e.currentTarget.value))}
            class="bg-stone-800 text-stone-200 text-sm font-bold py-2 pl-3 pr-8 rounded-lg border border-stone-700 hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
          >
            {timeOptions.map((t) => (
              <option value={t}>{t === 0 ? "∞" : `${t} min`}</option>
            ))}
          </select>
          <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-stone-400">
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              ></path>
            </svg>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            props.onRestart?.({ mode: currentMode(), timeControl: timeControl() })
          }
          disabled={props.isRestarting}
          class="bg-stone-100 hover:bg-white text-stone-900 font-bold py-2 px-4 rounded-lg transition-all uppercase tracking-wider text-xs border border-stone-200 shadow-lg disabled:opacity-50 hover:scale-105 active:scale-95"
        >
          {props.isRestarting ? "Starting..." : "New Game"}
        </button>
      </div>
    </header>
  );
};

export default Header;
