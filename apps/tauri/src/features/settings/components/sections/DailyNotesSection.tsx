import { SettingsFields } from "../SettingsFields";

export default function DailyNotesSection() {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 pb-4 border-b border-[--sat-border-default]">
        Daily notes
      </h2>
      <p className="text-sm text-[--sat-text-muted] mb-6">
        Open or create today's note with the{" "}
        <span className="text-[var(--sat-text-primary)] font-medium">
          Open today's daily note
        </span>{" "}
        command (ribbon button or command palette). A new note is created
        when today's note doesn't exist yet.
      </p>
      <SettingsFields section="dailies" />
    </div>
  );
}