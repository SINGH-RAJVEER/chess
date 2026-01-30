import { a as QueryClient } from "../_chunks/_libs/@tanstack/solid-query.mjs";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1e3 * 60
    }
  }
});
export {
  queryClient as q
};
