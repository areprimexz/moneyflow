import { Toaster } from "sonner";
import { usePreferences } from "@/lib/queries";

/** Toasts follow the app theme (not the OS theme). */
export function ThemedToaster() {
  const { theme } = usePreferences();
  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!bg-card !border !border-line-strong !text-fg !rounded-xl !shadow-2xl",
          description: "!text-muted",
        },
      }}
      offset={{ bottom: 24, right: 24 }}
      mobileOffset={{ bottom: 76 }}
    />
  );
}
