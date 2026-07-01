import { UI_PATHS, type CampaignIcon } from "../../campaign/icons";

// The campaign DOM icon (Phosphor fill) as JSX — byte-identical to uiIcon()'s
// string form, but composable with text/inputs in a component (so panel rows
// with an icon + a React-handled control don't need dangerouslySetInnerHTML).
export function UiIcon({ name, title }: { name: CampaignIcon; title?: string }) {
  return (
    <svg
      className="cmp-ico"
      viewBox="0 0 256 256"
      aria-hidden={title ? "false" : "true"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={UI_PATHS[name]} />
    </svg>
  );
}
