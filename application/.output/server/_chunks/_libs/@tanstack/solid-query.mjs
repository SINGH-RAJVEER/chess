import { Q as QueryClient$1, M as MutationObserver, s as shouldThrowError, n as noop, a as notifyManager, h as hydrate, b as QueryObserver } from "./query-core.mjs";
import { c as createRenderEffect, o as onCleanup, a as createComponent, b as createContext, u as useContext, d as createMemo, e as createStore, f as createComputed, g as on, i as isServer, h as createSignal, j as createResource, k as unwrap, r as reconcile } from "../../../_libs/solid-js.mjs";
var QueryClientContext = createContext(void 0);
var useQueryClient = (queryClient) => {
  if (queryClient) {
    return queryClient;
  }
  const client = useContext(QueryClientContext);
  if (!client) {
    throw new Error("No QueryClient set, use QueryClientProvider to set one");
  }
  return client();
};
var QueryClientProvider = (props) => {
  createRenderEffect((unmount) => {
    unmount?.();
    props.client.mount();
    return props.client.unmount.bind(props.client);
  });
  onCleanup(() => props.client.unmount());
  return createComponent(QueryClientContext.Provider, {
    value: () => props.client,
    get children() {
      return props.children;
    }
  });
};
var IsRestoringContext = createContext(() => false);
var useIsRestoring = () => useContext(IsRestoringContext);
IsRestoringContext.Provider;
function reconcileFn(store, result, reconcileOption, queryHash) {
  if (reconcileOption === false) return result;
  if (typeof reconcileOption === "function") {
    const newData2 = reconcileOption(store.data, result.data);
    return { ...result, data: newData2 };
  }
  let data = result.data;
  if (store.data === void 0) {
    try {
      data = structuredClone(data);
    } catch (error) {
    }
  }
  const newData = reconcile(data, {})(store.data);
  return { ...result, data: newData };
}
var hydratableObserverResult = (query, result) => {
  const obj = {
    ...unwrap(result),
    // During SSR, functions cannot be serialized, so we need to remove them
    // This is safe because we will add these functions back when the query is hydrated
    refetch: void 0
  };
  if ("fetchNextPage" in result) {
    obj.fetchNextPage = void 0;
    obj.fetchPreviousPage = void 0;
  }
  obj.hydrationData = {
    state: query.state,
    queryKey: query.queryKey,
    queryHash: query.queryHash,
    ...query.meta && { meta: query.meta }
  };
  return obj;
};
function useBaseQuery(options, Observer, queryClient) {
  const client = createMemo(() => useQueryClient(queryClient?.()));
  const isRestoring = useIsRestoring();
  let unsubscribeQueued = false;
  const defaultedOptions = createMemo(() => {
    const defaultOptions = client().defaultQueryOptions(options());
    defaultOptions._optimisticResults = isRestoring() ? "isRestoring" : "optimistic";
    defaultOptions.structuralSharing = false;
    if (isServer) {
      defaultOptions.retry = false;
      defaultOptions.throwOnError = true;
      defaultOptions.experimental_prefetchInRender = true;
    }
    return defaultOptions;
  });
  const initialOptions = defaultedOptions();
  const [observer, setObserver] = createSignal(
    new Observer(client(), defaultedOptions())
  );
  let observerResult = observer().getOptimisticResult(defaultedOptions());
  const [state, setState] = createStore(observerResult);
  const createServerSubscriber = (resolve, reject) => {
    return observer().subscribe((result) => {
      notifyManager.batchCalls(() => {
        const query = observer().getCurrentQuery();
        const unwrappedResult = hydratableObserverResult(query, result);
        if (result.data !== void 0 && unwrappedResult.isError) {
          reject(unwrappedResult.error);
          unsubscribeIfQueued();
        } else {
          resolve(unwrappedResult);
          unsubscribeIfQueued();
        }
      })();
    });
  };
  const unsubscribeIfQueued = () => {
    if (unsubscribeQueued) {
      unsubscribe?.();
      unsubscribeQueued = false;
    }
  };
  const createClientSubscriber = () => {
    const obs = observer();
    return obs.subscribe((result) => {
      observerResult = result;
      queueMicrotask(() => {
        if (unsubscribe) {
          refetch();
        }
      });
    });
  };
  function setStateWithReconciliation(res) {
    const opts = observer().options;
    const reconcileOptions = opts.reconcile;
    setState((store) => {
      return reconcileFn(
        store,
        res,
        reconcileOptions === void 0 ? false : reconcileOptions,
        opts.queryHash
      );
    });
  }
  function createDeepSignal() {
    return [
      () => state,
      (v) => {
        const unwrapped = unwrap(state);
        if (typeof v === "function") {
          v = v(unwrapped);
        }
        if (v?.hydrationData) {
          const { hydrationData, ...rest } = v;
          v = rest;
        }
        setStateWithReconciliation(v);
      }
    ];
  }
  let unsubscribe = null;
  let resolver = null;
  const [queryResource, { refetch }] = createResource(
    () => {
      const obs = observer();
      return new Promise((resolve, reject) => {
        resolver = resolve;
        if (isServer) {
          unsubscribe = createServerSubscriber(resolve, reject);
        }
        obs.updateResult();
        if (observerResult.isError && !observerResult.isFetching && !isRestoring() && shouldThrowError(obs.options.throwOnError, [
          observerResult.error,
          obs.getCurrentQuery()
        ])) {
          setStateWithReconciliation(observerResult);
          return reject(observerResult.error);
        }
        if (!observerResult.isLoading) {
          resolver = null;
          return resolve(
            hydratableObserverResult(obs.getCurrentQuery(), observerResult)
          );
        }
        setStateWithReconciliation(observerResult);
      });
    },
    {
      storage: createDeepSignal,
      get deferStream() {
        return options().deferStream;
      },
      /**
       * If this resource was populated on the server (either sync render, or streamed in over time), onHydrated
       * will be called. This is the point at which we can hydrate the query cache state, and setup the query subscriber.
       *
       * Leveraging onHydrated allows us to plug into the async and streaming support that solidjs resources already support.
       *
       * Note that this is only invoked on the client, for queries that were originally run on the server.
       */
      onHydrated(_k, info) {
        if (info.value && "hydrationData" in info.value) {
          hydrate(client(), {
            // @ts-expect-error - hydrationData is not correctly typed internally
            queries: [{ ...info.value.hydrationData }]
          });
        }
        if (unsubscribe) return;
        const newOptions = { ...initialOptions };
        if ((initialOptions.staleTime || !initialOptions.initialData) && info.value) {
          newOptions.refetchOnMount = false;
        }
        observer().setOptions(newOptions);
        setStateWithReconciliation(observer().getOptimisticResult(newOptions));
        unsubscribe = createClientSubscriber();
      }
    }
  );
  createComputed(
    on(
      client,
      (c) => {
        if (unsubscribe) {
          unsubscribe();
        }
        const newObserver = new Observer(c, defaultedOptions());
        unsubscribe = createClientSubscriber();
        setObserver(newObserver);
      },
      {
        defer: true
      }
    )
  );
  createComputed(
    on(
      isRestoring,
      (restoring) => {
        if (!restoring && !isServer) ;
      },
      { defer: true }
    )
  );
  onCleanup(() => {
    if (queryResource.loading) {
      unsubscribeQueued = true;
      return;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });
  createComputed(
    on(
      [observer, defaultedOptions],
      ([obs, opts]) => {
        obs.setOptions(opts);
        setStateWithReconciliation(obs.getOptimisticResult(opts));
        refetch();
      },
      { defer: true }
    )
  );
  const handler = {
    get(target, prop) {
      if (prop === "data") {
        if (state.data !== void 0) {
          return queryResource.latest?.data;
        }
        return queryResource()?.data;
      }
      return Reflect.get(target, prop);
    }
  };
  return new Proxy(state, handler);
}
function useQuery(options, queryClient) {
  return useBaseQuery(
    createMemo(() => options()),
    QueryObserver,
    queryClient
  );
}
function useMutation(options, queryClient) {
  const client = createMemo(() => useQueryClient(queryClient?.()));
  const observer = new MutationObserver(client(), options());
  const mutate = (variables, mutateOptions) => {
    observer.mutate(variables, mutateOptions).catch(noop);
  };
  const [state, setState] = createStore({
    ...observer.getCurrentResult(),
    mutate,
    mutateAsync: observer.getCurrentResult().mutate
  });
  createComputed(() => {
    observer.setOptions(options());
  });
  createComputed(
    on(
      () => state.status,
      () => {
        if (state.isError && shouldThrowError(observer.options.throwOnError, [state.error])) {
          throw state.error;
        }
      }
    )
  );
  const unsubscribe = observer.subscribe((result) => {
    setState({
      ...result,
      mutate,
      mutateAsync: result.mutate
    });
  });
  onCleanup(unsubscribe);
  return state;
}
var QueryClient = class extends QueryClient$1 {
  constructor(config = {}) {
    super(config);
  }
};
var createQuery = useQuery;
var createMutation = useMutation;
export {
  QueryClient as Q,
  QueryClientProvider as a,
  createMutation as b,
  createQuery as c,
  useQueryClient as u
};
