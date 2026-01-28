import { HttpStatusCode } from "@solidjs/start";
import { useLocation } from "@solidjs/router";

export default function NotFound() {
  const location = useLocation();
  return (
    <main class="w-full p-4 space-y-2">
      <HttpStatusCode code={404} />
      <h1 class="font-bold text-xl">Page Not Found</h1>
      <p>Path: {location.pathname}</p>
    </main>
  );
}
