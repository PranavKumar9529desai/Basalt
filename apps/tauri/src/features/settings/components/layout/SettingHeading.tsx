export interface SettingHeadingProps {
  title: string;
  description?: React.ReactNode;
}

/**
 * SettingHeading — sub-section divider (ADR-037 §3.2). Partitions a
 * long settings page into readable clusters ("Account", "Advanced").
 */
export function SettingHeading({ title, description }: SettingHeadingProps) {
  return (
    <div className="mt-8 mb-3 pt-4 border-t border-[var(--sat-layout-border)] first:mt-0 first:pt-0 first:border-t-0">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--sat-text-secondary)]">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[var(--sat-text-muted)] mt-1 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
