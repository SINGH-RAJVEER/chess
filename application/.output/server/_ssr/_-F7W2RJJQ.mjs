import { s as ssr, p as ssrHydrationKey } from "../_libs/solid-js.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
var _tmpl$ = ["<div", ' class="p-4 text-center"><h1 class="text-2xl font-bold">404 - Not Found</h1><p>The page you are looking for does not exist.</p></div>'];
function NotFound() {
  return ssr(_tmpl$, ssrHydrationKey());
}
export {
  NotFound as component
};
