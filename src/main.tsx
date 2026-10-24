import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tooltip } from "radix-ui";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => count < 2 && !(error instanceof Error && "status" in error && (error as { status: number }).status >= 400 && (error as { status: number }).status < 500),
      refetchOnWindowFocus: true,
      staleTime: 1_000,
    },
  },
  mutationCache: new MutationCache(),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
          <App />
          <Toaster
            position="bottom-right"
            theme="system"
            toastOptions={{
              classNames: {
                toast: "!bg-card !border !border-line-strong !text-fg !rounded-xl !shadow-2xl",
                description: "!text-muted",
              },
            }}
            offset={{ bottom: 24, right: 24 }}
            mobileOffset={{ bottom: 76 }}
          />
        </Tooltip.Provider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
