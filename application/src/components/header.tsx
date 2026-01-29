import type { Component } from "solid-js";

const Header: Component = () => {
  return (
    <header class="bg-stone-900 text-white shadow-md px-6 py-3 sticky top-0 z-50 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <span class="text-3xl">♛</span>
        <h1 class="text-2xl font-black tracking-tighter uppercase">
          Chess<span class="text-indigo-500">Master</span>
        </h1>
      </div>

      <div class="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center font-bold shadow-lg cursor-pointer hover:bg-indigo-500 transition">
        R
      </div>
    </header>
  );
};

export default Header;
