import { c as createServerFn, T as TSS_SERVER_FUNCTION, g as getServerFnById } from "./index.mjs";
import { s as ssr, w as ssrAttribute, t as escape, a as createComponent, p as ssrHydrationKey, S as Show, F as For, h as createSignal } from "../_libs/solid-js.mjs";
import { L as Link$1 } from "./router-C25lm1AY.mjs";
const createSsrRpc = (functionId, importer) => {
  const url = "/_serverFn/" + functionId;
  const serverFnMeta = { id: functionId };
  const fn = async (...args) => {
    const serverFn = await getServerFnById(functionId);
    return serverFn(...args);
  };
  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const getBoard = createServerFn({
  method: "POST"
}).handler(createSsrRpc("075bb97a5df53025c3a5cac3463aa1757848b60aac35966d56b3f5f04c96a880"));
createServerFn({
  method: "POST"
}).inputValidator((square) => square).handler(createSsrRpc("7f22913cc8d51a01984f7bf48fae2f2d31d571b490a9d584529e84f9899ea385"));
const undoMove = createServerFn({
  method: "POST"
}).handler(createSsrRpc("794ae25fdbad27267eddca374cd262923ce3a47f4b66b732f323ab20dcc22590"));
const makeMove = createServerFn({
  method: "POST"
}).inputValidator((args) => args).handler(createSsrRpc("972086331ae1ccaf15884371b3d836c8b8cb9863f2467b06d69aa6f6555bec6c"));
const resetGame = createServerFn({
  method: "POST"
}).inputValidator((args) => args).handler(createSsrRpc("614b8f455b0bec4996eb16fc2e9a0377d9b5aca3671eb868a2af8c02e22f2c72"));
var _tmpl$ = ["<span", ' class="text-3xl">♛</span>'], _tmpl$2 = ["<h1", ' class="text-2xl font-black tracking-tighter uppercase hidden sm:block">Chess<span class="text-indigo-500">Master</span></h1>'], _tmpl$3 = ["<div", ' class="fixed inset-0 z-10 cursor-default"></div>'], _tmpl$4 = ["<div", ' class="absolute right-0 mt-2 w-56 bg-stone-800 rounded-xl shadow-xl border border-stone-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right"><div class="max-h-[80vh] overflow-y-auto py-1"><!--$-->', '<!--/--><div class="p-2 border-t border-stone-700"><button class="', '"><span>∞</span> Unlimited</button></div></div></div>'], _tmpl$5 = ["<div", ' class="relative"><button class="flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-bold py-2 pl-4 pr-3 rounded-lg border border-stone-700 hover:border-indigo-500 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[100px] justify-between"><span>', '</span><svg class="', '" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button><!--$-->', "<!--/--></div>"], _tmpl$6 = ["<header", ' class="bg-stone-900 text-white shadow-md px-6 py-3 sticky top-0 z-50 flex items-center justify-between"><!--$-->', '<!--/--><div class="flex items-center justify-center flex-1"><div class="bg-stone-800 p-1 rounded-lg flex items-center shadow-inner"><!--$-->', "<!--/--><!--$-->", '<!--/--></div></div><div class="flex items-center gap-3 justify-end w-1/4"><!--$-->', '<!--/--><button type="button"', ' class="bg-stone-100 hover:bg-white text-stone-900 font-bold py-2 px-4 rounded-lg transition-all uppercase tracking-wider text-xs border border-stone-200 shadow-lg disabled:opacity-50 hover:scale-105 active:scale-95">', "</button></div></header>"], _tmpl$7 = ["<div", ' class="p-2"><div class="text-xs font-bold text-stone-500 uppercase tracking-wider px-2 mb-1">', '</div><div class="grid grid-cols-2 gap-1">', "</div></div>"], _tmpl$8 = ["<button", ' class="', '"><!--$-->', "<!--/--> min</button>"];
const Header = (props) => {
  const [isOpen] = createSignal(false);
  const [selectedTime] = createSignal(10);
  const timeCategories = [{
    label: "Bullet",
    options: [1]
  }, {
    label: "Blitz",
    options: [3, 5]
  }, {
    label: "Rapid",
    options: [10, 30]
  }, {
    label: "Tournament",
    options: [60]
  }];
  const currentMode = () => props.activeMode || "vs_player";
  return ssr(_tmpl$6, ssrHydrationKey(), escape(createComponent(Link$1, {
    to: "/",
    "class": "flex items-center gap-3 w-1/4 hover:opacity-90 transition-opacity",
    get children() {
      return [ssr(_tmpl$, ssrHydrationKey()), ssr(_tmpl$2, ssrHydrationKey())];
    }
  })), escape(createComponent(Link$1, {
    to: "/computer",
    get ["class"]() {
      return `px-4 py-1.5 rounded-md text-sm font-bold transition-all ${currentMode() === "vs_computer" ? "bg-indigo-600 text-white shadow-md" : "text-stone-400 hover:text-stone-200"}`;
    },
    children: "Vs Computer"
  })), escape(createComponent(Link$1, {
    to: "/",
    get ["class"]() {
      return `px-4 py-1.5 rounded-md text-sm font-bold transition-all ${currentMode() === "vs_player" ? "bg-indigo-600 text-white shadow-md" : "text-stone-400 hover:text-stone-200"}`;
    },
    children: "Vs Player"
  })), escape(createComponent(Show, {
    get when() {
      return currentMode() !== "vs_computer";
    },
    get children() {
      return ssr(_tmpl$5, ssrHydrationKey(), selectedTime() === 0 ? "∞ Unlimited" : `${escape(selectedTime())} min`, `w-4 h-4 transition-transform ${isOpen() ? "rotate-180" : ""}`, escape(createComponent(Show, {
        get when() {
          return isOpen();
        },
        get children() {
          return [ssr(_tmpl$3, ssrHydrationKey()), ssr(_tmpl$4, ssrHydrationKey(), escape(createComponent(For, {
            each: timeCategories,
            children: (category) => ssr(_tmpl$7, ssrHydrationKey(), escape(category.label), escape(createComponent(For, {
              get each() {
                return category.options;
              },
              children: (option) => ssr(_tmpl$8, ssrHydrationKey(), `text-sm font-bold py-2 px-3 rounded-md transition-colors text-center ${selectedTime() === option ? "bg-indigo-600 text-white" : "text-stone-300 hover:bg-stone-700 hover:text-white"}`, escape(option))
            })))
          })), `w-full text-sm font-bold py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-2 ${selectedTime() === 0 ? "bg-indigo-600 text-white" : "text-stone-300 hover:bg-stone-700 hover:text-white"}`)];
        }
      })));
    }
  })), ssrAttribute("disabled", props.isRestarting, true), props.isRestarting ? "Starting..." : "New Game");
};
export {
  Header as H,
  getBoard as g,
  makeMove as m,
  resetGame as r,
  undoMove as u
};
