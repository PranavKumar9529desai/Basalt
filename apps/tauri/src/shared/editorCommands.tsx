/**
 * editorCommands — decomposition entry (ADR-038 §3). Registrations now live
 * in shared/commands/: editorCommands.tsx (editor-scoped), tableCommands.tsx
 * (rich-table), devBenchmarks.ts (dev tooling). This file re-exports the
 * siblings in registration order so the existing consumer path
 * ("shared/editorCommands") keeps resolving unchanged.
 */
export * from "./commands/editorCommands";
export * from "./commands/tableCommands";
export * from "./commands/devBenchmarks";