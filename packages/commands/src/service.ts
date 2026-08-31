/**
 * CommandService — Centralized command registry (TS service, not React).
 *
 * Architecture: All commands (palette actions, keybinding targets) register
 * here. The service owns metadata (from commands.json) and runtime callbacks
 * (registered by features/shell). It is a plain TS class — no React, no
 * hooks, no JSX. React integration is via CommandProvider (DI wrapper).
 *
 * Features register commands in useEffect cleanup patterns. Shell registers
 * commands that depend on runtime hook data. The service never imports from
 * features — it's a leaf dependency.
 */
import { createElement } from "react";
import COMMANDS from "./commands.json";
import { resolveIcon } from "./icons";
import type { Command, CommandMetadata } from "./types";

export class CommandService {
  private commands = new Map<string, Command>();

  registerCommand(
    id: string,
    callback: () => void | Promise<void>,
    checkCallback?: () => boolean,
  ): void {
    const meta = COMMANDS.find((c) => c.id === id);
    if (!meta) {
      console.warn(`Unknown command id: "${id}". Add it to commands.json.`);
      return;
    }
    const IconComponent = resolveIcon(meta.icon);
    const icon = IconComponent
      ? createElement(IconComponent, { size: 16 })
      : undefined;
    this.register({ ...meta, icon, callback, checkCallback });
  }

  register(cmd: Command): void {
    if (this.commands.has(cmd.id)) {
      console.warn(`Command "${cmd.id}" is already registered. Overwriting.`);
    }
    this.commands.set(cmd.id, cmd);
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  execute(id: string): void {
    const cmd = this.commands.get(id);
    if (cmd && (!cmd.checkCallback || cmd.checkCallback())) {
      // Commands own their error handling; palette dispatch is fire-and-forget.
      void cmd.callback();
    }
  }

  getCommands(): Command[] {
    return Array.from(this.commands.values()).filter(
      (cmd) => !cmd.checkCallback || cmd.checkCallback(),
    );
  }

  getMetadata(): CommandMetadata[] {
    return COMMANDS;
  }
}

export const commandService = new CommandService();
