import { createFileRoute, Link } from "@tanstack/solid-router";
import Header from "../components/header";

export const Route = createFileRoute("/computer")({
  component: ComputerPage,
});

function ComputerPage() {
  return (
    <div class="min-h-screen bg-stone-100 font-sans text-stone-800 flex flex-col">
      {/* 
          We pass activeMode="vs_computer" to highlight the correct tab.
          onRestart is not provided or could be a no-op since it's under construction.
      */}
      <Header activeMode="vs_computer" /> 
      
      <div class="flex-1 flex flex-col items-center justify-center p-4">
          <div class="bg-stone-900/90 p-12 rounded-3xl shadow-2xl flex flex-col items-center text-center text-white max-w-2xl backdrop-blur-sm border-8 border-stone-800 animate-in fade-in zoom-in duration-500">
              <div class="text-8xl mb-6 animate-bounce">🏗️</div>
              <h2 class="text-5xl font-black mb-4 uppercase tracking-tighter">Under Construction</h2>
              <p class="text-stone-400 text-xl mb-8 leading-relaxed">
                The Chess Engine is currently being calibrated in the neural network. 
                <br/>
                Please play against a friend in <span class="text-indigo-400 font-bold">Vs Player</span> mode for now.
              </p>
              <Link
                to="/"
                class="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all transform hover:-translate-y-1 shadow-lg text-lg uppercase tracking-wider flex items-center gap-2"
              >
                <span>♟️</span> Return to Vs Player
              </Link>
          </div>
       </div>
    </div>
  );
}
