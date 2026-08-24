/**
 * KeybindingProvider + KeybindingListener — React integration for KeybindingService.
 *
 * Architecture: KeybindingProvider makes the service injectable via
 * Context (DI without a container). KeybindingListener mounts a single
 * window keydown listener that routes through the service. Features
 * use useKeybindingService() to call setContext() — they never import
 * the service directly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { KeybindingService, keybindingService } from "./keybinding-service";

const KeybindingContext = createContext<KeybindingService>(keybindingService);

export function KeybindingProvider({ children }: { children: ReactNode }) {
  return (
    <KeybindingContext.Provider value={keybindingService}>
      {children}
    </KeybindingContext.Provider>
  );
}

export function useKeybindingService(): KeybindingService {
  return useContext(KeybindingContext);
}

/**
 * Mounts a single window keydown listener that routes through KeybindingService.
 * Mount this once at the app root.
 */
export function KeybindingListener() {
  const service = useKeybindingService();

  const handleKeydown = useCallback(
    (e: KeyboardEvent) => {
      service.handleKeydown(e);
    },
    [service],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleKeydown]);

  return null;
}
