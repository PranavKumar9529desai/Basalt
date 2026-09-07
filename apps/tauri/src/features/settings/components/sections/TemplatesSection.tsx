import { SettingsFields } from "../SettingsFields";

export default function TemplatesSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 pb-4 border-b border-[--sat-border-default]">
        Templates
      </h2>
      <p className="text-sm text-[--sat-text-muted] mb-6">
        Insert saved templates into the active note with the{" "}
        <span className="text-[var(--sat-text-primary)] font-medium">
          Insert template
        </span>{" "}
        command (ribbon button or command palette).
      </p>
      <SettingsFields section="templates" />
    </div>
  );
}