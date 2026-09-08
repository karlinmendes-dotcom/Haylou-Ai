import { ConvexProvider, ConvexReactClient } from "convex/react";
import { anyApi as api } from "../convex/_generated/api";
import type { ReactNode } from "react";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const client = new ConvexReactClient(convexUrl ?? "https://moonlit-walrus-691.convex.cloud");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

export { api };
