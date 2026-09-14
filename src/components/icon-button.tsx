import type { LucideIcon } from "lucide-react";

interface IconButtonProps {
  icon: LucideIcon;
  label: string; // used for the custom tooltip + aria-label
  href?: string;
  onClick?: () => void;
  theme?: "default" | "danger";
}

/**
 * Icon-only button with a custom (CSS) tooltip — NOT the native `title`
 * tooltip, so styling is consistent across the app.
 */
export function IconButton({ icon: Icon, label, href, onClick, theme = "default" }: IconButtonProps) {
  const classes = `icon-btn icon-btn--${theme}`;
  const inner = (
    <span className="tooltip-wrap">
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
      <span className="tooltip-bubble" role="tooltip">{label}</span>
    </span>
  );

  if (href) {
    return (
      <a className={classes} href={href} aria-label={label}>
        {inner}
      </a>
    );
  }
  return (
    <button className={classes} onClick={onClick} aria-label={label} type="button">
      {inner}
    </button>
  );
}
