// @refresh reload
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, ErrorBoundary } from "solid-js";
import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <ErrorBoundary fallback={(err) => <div>Error: {err.message}</div>}>
          <Suspense>{props.children}</Suspense>
        </ErrorBoundary>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
