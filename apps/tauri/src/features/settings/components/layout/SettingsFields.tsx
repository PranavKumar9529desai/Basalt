import { useMemo } from "react";
import { useSettingsStore, writeSetting } from "../../settings-data";
import type { SettingItemSpec } from "../../types";
import {
  SettingButton,
  SettingColor,
  SettingDropdown,
  SettingInput,
  SettingSlider,
  SettingToggle,
} from "../controls";
import { SettingHeading } from "./SettingHeading";
import { SettingItem } from "./SettingItem";

export interface SettingsFieldsProps {
  /** Declarative item specs for the active section. */
  specs: SettingItemSpec[];
  /** Deep-search query — non-matching items are filtered out (ADR-037 §5). */
  query?: string;
}

/**
 * SettingsFields — automatic spec form renderer (ADR-037 §2). Renders
 * `SettingItemSpec[]` as standard two-column SettingItem rows; plugins
 * describe their fields as data and get zero-boilerplate UI. Also
 * implements the panel-side deep-search response: items that don't
 * match the query are filtered out.
 */
export function SettingsFields({ specs, query = "" }: SettingsFieldsProps) {
  const q = query.trim().toLowerCase();

  const visible = useMemo(
    () => (q ? specs.filter((s) => itemMatches(s, q)) : specs),
    [specs, q],
  );

  const rows: React.ReactNode[] = [];
  let lastHeading: string | undefined;
  for (const spec of visible) {
    if (spec.heading && spec.heading !== lastHeading) {
      lastHeading = spec.heading;
      rows.push(
        <SettingHeading
          key={`heading-${spec.heading}`}
          title={spec.heading}
          description={spec.headingDescription}
        />,
      );
    }
    rows.push(<SettingRow key={`${spec.heading ?? ""}-${spec.name}`} spec={spec} query={q} />);
  }

  return <div>{rows}</div>;
}

/** Reactive read of a single string-keyed setting. */
function useSettingValue(key: string): unknown {
  return useSettingsStore((state) => state.values[key]);
}

function SettingRow({ spec, query }: { spec: SettingItemSpec; query: string }) {
  const value = useSettingValue(spec.key ?? "");
  const disabled =
    typeof spec.disabled === "function" ? spec.disabled() : spec.disabled;

  const commit = (next: unknown) => {
    if (spec.onChange) {
      spec.onChange(next);
    } else if (spec.key) {
      writeSetting(spec.key, next);
    }
  };

  let control: React.ReactNode = null;
  switch (spec.type) {
    case "toggle":
      control = (
        <SettingToggle
          checked={Boolean(value)}
          onCheckedChange={commit}
          disabled={disabled}
        />
      );
      break;
    case "text":
      control = (
        <SettingInput
          value={String(value ?? "")}
          onValueChange={(v) => commit(v)}
          placeholder={spec.placeholder}
          disabled={disabled}
        />
      );
      break;
    case "number":
      control = (
        <SettingInput
          type="number"
          value={String(value ?? "")}
          onValueChange={(v) => {
            const n = Number(v);
            if (!Number.isNaN(n)) commit(n);
          }}
          placeholder={spec.placeholder}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          disabled={disabled}
        />
      );
      break;
    case "dropdown":
      control = (
        <SettingDropdown
          value={String(value ?? "")}
          onValueChange={(v) => commit(v)}
          options={spec.options ?? []}
          disabled={disabled}
        />
      );
      break;
    case "slider":
      control = (
        <SettingSlider
          value={Number(value ?? spec.min ?? 0)}
          onValueChange={commit}
          min={spec.min ?? 0}
          max={spec.max ?? 100}
          step={spec.step ?? 1}
          disabled={disabled}
        />
      );
      break;
    case "button":
      control = spec.button ? <SettingButton button={spec.button} /> : null;
      break;
    case "button-group":
      control = (
        <div className="flex items-center gap-2">
          {(spec.buttons ?? []).map((b, i) => (
            <SettingButton key={`${b.text}-${i}`} button={b} />
          ))}
        </div>
      );
      break;
    case "color":
      control = (
        <SettingColor
          value={String(value ?? "")}
          onValueChange={(v) => commit(v)}
          options={spec.options ?? []}
          disabled={disabled}
        />
      );
      break;
  }

  return (
    <SettingItem
      name={highlight(spec.name, query)}
      description={
        typeof spec.description === "string" && query
          ? highlight(spec.description, query)
          : spec.description
      }
    >
      {control}
    </SettingItem>
  );
}

/** Does an item match the query? Name, description, or declared keywords. */
function itemMatches(spec: SettingItemSpec, q: string): boolean {
  if (spec.name.toLowerCase().includes(q)) return true;
  if (typeof spec.description === "string" && spec.description.toLowerCase().includes(q))
    return true;
  return (spec.keywords ?? []).some((k) => k.toLowerCase().includes(q));
}

/** Wrap matched substrings in a mark for the deep-search response (ADR-037 §5). */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[2px] bg-[var(--sat-accent-primary)]/20 text-[var(--sat-text-primary)]">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}