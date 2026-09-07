import { Input } from "@workspace/ui/components/ui/input";

import { SETTING_SPECS, setSetting, useSetting } from "../settings-data";

/**
 * Generic settings form renderer (ADR-036). Renders one row per declarative
 * `SETTING_SPECS` entry for the given section — plugins describe their
 * settings in `SETTING_SPECS` instead of hand-building forms.
 */
export function SettingsFields({ section }: { section: string }) {
  const specs = SETTING_SPECS[section] ?? [];
  return (
    <div className="space-y-6">
      {specs.map((spec) => (
        <SettingField key={spec.key} spec={spec} />
      ))}
    </div>
  );
}

function SettingField({ spec }: { spec: (typeof SETTING_SPECS)[string][number] }) {
  const value = useSetting(spec.key);
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={`setting-${spec.key}`}
        className="text-sm font-medium text-[var(--sat-text-primary)]"
      >
        {spec.label}
      </label>
      {spec.description && (
        <p className="text-xs text-[var(--sat-text-muted)] leading-relaxed">
          {spec.description}
        </p>
      )}
      <Input
        id={`setting-${spec.key}`}
        type="text"
        value={String(value)}
        placeholder={spec.placeholder}
        onChange={(e) => setSetting(spec.key, e.target.value)}
        className="max-w-md"
      />
    </div>
  );
}