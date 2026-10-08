import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = Readonly<{
  requestId: string;
  method: string;
  path: string;
  startedAt: number;
}>;

const storeKey = "__chapegaRequestContextStore";
const globalStore = globalThis as typeof globalThis & {
  [storeKey]?: AsyncLocalStorage<RequestContext>;
};

/** One store per process, shared across Next.js module graphs. */
export const requestContextStore =
  globalStore[storeKey] ?? (globalStore[storeKey] = new AsyncLocalStorage());

export function currentRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}

export function currentRequestId(): string | undefined {
  return requestContextStore.getStore()?.requestId;
}
