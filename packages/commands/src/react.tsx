/**
 * CommandProvider — React DI wrapper for CommandService.
 *
 * Architecture: Makes the CommandService injectable via Context without
 * requiring a DI container. Features call useCommandService() to register
 * commands in useEffect patterns. Shell mounts <CommandProvider> at the
 * root so all descendants can access the service.
 */
import { createContext, useContext, type ReactNode } from "react";
import { CommandService, commandService } from "./service";

const CommandServiceContext = createContext<CommandService>(commandService);

export function CommandProvider({ children }: { children: ReactNode }) {
  return (
    <CommandServiceContext.Provider value={commandService}>
      {children}
    </CommandServiceContext.Provider>
  );
}

export function useCommandService(): CommandService {
  return useContext(CommandServiceContext);
}
