import type { Command } from "@workspace/commands";
import { commandService } from "@workspace/commands";
import { useKeybindingService } from "@workspace/keybindings";
import { IconAlertCircle, IconRotate, IconUnlink } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@workspace/ui/components/ui/button";

interface HotkeyRow {
  command: Command;
  key: string;
  deviates: boolean;
  conflict?: string;
}

/**
 * HotkeysSection — per-command shortcut table (ADR-037 §7.E / spec §5.5).
 *
 * Virtualized list of every registered command with its effective
 * keybinding. Clicking Customize arms a short one-shot recorder: the
 * next keydown becomes the binding, the modifiers are normalized, and
 * conflicts with other commands are flagged (allowed, but reported).
 * Custom bindings and unbound commands persist via the service.
 */
export function HotkeysSection() {
  const service = useKeybindingService();
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const commandNameById = useMemo(
    () => new Map(commandService.getCommands().map((c) => [c.id, c.name])),
    [],
  );

  const rows = useMemo<HotkeyRow[]>(() => {
    void version; // invalidate memo after every binding mutation
    const q = query.trim().toLowerCase();
    const keyByCommand = new Map<string, string>();
    for (const b of service.getBindings()) {
      if (b.command) keyByCommand.set(b.command, b.key);
    }
    return commandService
      .getCommands()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.category ?? "").toLowerCase().includes(q) ||
          (keyByCommand.get(c.id) ?? "").toLowerCase().includes(q),
      )
      .map((command) => {
        const key = keyByCommand.get(command.id) ?? "";
        const conflict = key
          ? service.conflictsWith(key, command.id)
          : undefined;
        return {
          command,
          key,
          deviates: service.hasCustomBinding(command.id),
          conflict,
        };
      });
  }, [query, service, version]);

  /** One-shot key recorder — while armed, the next keydown is the binding. */
  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;

      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push("CmdOrCtrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      const key =
        e.key === " "
          ? "Space"
          : e.key.length === 1
            ? e.key.toUpperCase()
            : e.key;
      parts.push(key);
      const hotkey = parts.join("+");

      const result = service.setCustomBinding(recording, hotkey);
      setRecording(null);
      if (result.ok) {
        const name = commandNameById.get(recording) ?? recording;
        setNotice(
          result.conflict
            ? `Assigned ${hotkey} to ${name} — conflicts with ${commandNameById.get(result.conflict) ?? result.conflict}.`
            : `Assigned ${hotkey} to ${name}.`,
        );
      } else {
        setNotice(result.error);
      }
      setVersion((v) => v + 1);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, service, commandNameById]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 46,
    overscan: 10,
  });

  return (
    <div>
      <div className="mb-3 flex min-h-8 items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands or keybindings..."
          className="h-8 w-[280px] rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-2)] px-2.5 text-xs text-[var(--sat-text-primary)] placeholder:text-[var(--sat-text-muted)] focus:ring-1 focus:ring-[var(--sat-accent-primary)] focus:outline-none"
        />
        {notice && (
          <span
            className={
              "flex items-center gap-1 text-xs " +
              (notice.includes("conflicts")
                ? "text-[var(--sat-state-warning)]"
                : "text-[var(--sat-text-muted)]")
            }
          >
            {notice.includes("conflicts") && <IconAlertCircle size={12} />}
            {notice}
          </span>
        )}
      </div>

      <div
        ref={parentRef}
        className="h-[60vh] overflow-auto rounded-md border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)]"
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const isRecording = recording === row.command.id;
            return (
              <div
                key={row.command.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
                className="flex items-center justify-between gap-4 border-b border-[var(--sat-layout-border)] px-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-xs font-medium text-[var(--sat-text-primary)]">
                    {row.command.name}
                  </span>
                  <span className="shrink-0 rounded bg-[var(--sat-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--sat-text-muted)]">
                    {row.command.id}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isRecording ? (
                    <span className="text-xs font-medium text-[var(--sat-accent-primary)]">
                      Press desired shortcut… (Esc to cancel)
                    </span>
                  ) : (
                    <>
                      {row.key ? (
                        <span className="rounded border border-[var(--sat-layout-border)] bg-[var(--sat-surface-1)] px-2 py-0.5 font-mono text-[11px] text-[var(--sat-text-primary)]">
                          {row.key}
                        </span>
                      ) : (
                        <span className="text-[11px] italic text-[var(--sat-text-muted)]">
                          Unassigned
                        </span>
                      )}
                      {row.conflict && (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--sat-state-warning)]">
                          <IconAlertCircle size={11} />
                          {commandNameById.get(row.conflict) ?? row.conflict}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          setRecording(row.command.id);
                          setNotice(null);
                        }}
                      >
                        {row.deviates ? "Replace" : "Customize"}
                      </Button>
                      {row.deviates && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            title="Reset to default keybinding"
                            aria-label={`Reset ${row.command.name} keybinding`}
                            onClick={() => {
                              service.resetBinding(row.command.id);
                              setVersion((v) => v + 1);
                              setNotice(
                                `Reset ${row.command.name} to its default.`,
                              );
                            }}
                          >
                            <IconRotate size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            title="Unbind this command"
                            aria-label={`Unbind ${row.command.name}`}
                            onClick={() => {
                              service.unbind(row.command.id);
                              setVersion((v) => v + 1);
                              setNotice(`Unbound ${row.command.name}.`);
                            }}
                          >
                            <IconUnlink size={12} />
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--sat-text-muted)]">
        Click Customize, then press the new shortcut. Conflicts are allowed but
        flagged; Reset restores the default, Unbind removes the shortcut.
      </p>
    </div>
  );
}
