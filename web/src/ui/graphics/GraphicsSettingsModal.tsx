import { useEffect, useState } from "react";
import {
  getGraphicsSettings,
  graphicsQueryOverrides,
  subscribeGraphicsSettings,
  updateGraphicsSettings,
  type GraphicsSettings,
  type GraphicsGrassQuality,
  type GraphicsShadowMode,
} from "../../shared/graphicsSettings";

const SHADOW_CHOICES: Array<{ value: GraphicsShadowMode; label: string }> = [
  { value: "off", label: "Off" },
  { value: "single", label: "Fast" },
  { value: "csm", label: "High" },
];

const GRASS_QUALITY_CHOICES: Array<{ value: GraphicsGrassQuality; label: string }> = [
  { value: "low", label: "Low" },
  { value: "standard", label: "Standard" },
  { value: "fine", label: "Fine" },
];

export interface GraphicsSettingsPanelProps {
  onClose?: () => void;
}

export function GraphicsSettingsPanel({ onClose }: GraphicsSettingsPanelProps) {
  const [settings, setSettings] = useState<GraphicsSettings>(() => getGraphicsSettings());
  useEffect(() => subscribeGraphicsSettings(setSettings), []);
  const overrides =
    typeof location === "undefined"
      ? { shadows: false, grassQuality: false, grass: false, farGrass: false, bloom: false }
      : graphicsQueryOverrides(location.search);

  return (
    <div className="gfx-settings-panel">
      <h2 id="graphics-settings-title">Graphics</h2>
      <div className="gfx-setting-row">
        <div>
          <b>Shadows</b>
          <small>Applies at next battle</small>
        </div>
        <div className="gfx-segment" role="radiogroup" aria-label="Shadows">
          {SHADOW_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              id={`gfx-shadows-${choice.value}`}
              className={settings.shadows === choice.value ? "on" : ""}
              aria-pressed={settings.shadows === choice.value}
              disabled={overrides.shadows}
              onClick={() => updateGraphicsSettings({ shadows: choice.value })}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
      <div className="gfx-setting-row">
        <div>
          <b>Grass quality</b>
          <small>Applies at next battle</small>
        </div>
        <div className="gfx-segment" role="radiogroup" aria-label="Grass quality">
          {GRASS_QUALITY_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              id={`gfx-grass-quality-${choice.value}`}
              className={settings.grassQuality === choice.value ? "on" : ""}
              aria-pressed={settings.grassQuality === choice.value}
              disabled={overrides.grassQuality}
              onClick={() => updateGraphicsSettings({ grassQuality: choice.value })}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
      <ToggleRow
        id="gfx-grass"
        label="Grass"
        checked={settings.grass}
        disabled={overrides.grass}
        note="Applies live in battle"
        onChange={(grass) => updateGraphicsSettings({ grass })}
      />
      <ToggleRow
        id="gfx-far-grass"
        label="Distant grass"
        checked={settings.farGrass}
        disabled={overrides.farGrass}
        note="Applies live in battle"
        onChange={(farGrass) => updateGraphicsSettings({ farGrass })}
      />
      <ToggleRow
        id="gfx-bloom"
        label="Bloom"
        checked={settings.bloom}
        disabled={overrides.bloom}
        note="Applies live in battle"
        onChange={(bloom) => updateGraphicsSettings({ bloom })}
      />
      {Object.values(overrides).some(Boolean) ? (
        <p className="gfx-note">QA URL overrides are active for this run.</p>
      ) : null}
      {onClose ? (
        <button type="button" id="gfx-back" className="gfx-close" onClick={onClose}>
          Back
        </button>
      ) : null}
    </div>
  );
}

export interface GraphicsSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function GraphicsSettingsModal({ open, onClose }: GraphicsSettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      id="graphics-settings-modal"
      className="gfx-settings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="graphics-settings-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="gfx-settings-dialog hud-chassis hud-chassis--tray">
        <GraphicsSettingsPanel onClose={onClose} />
      </div>
    </div>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  note: string;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, checked, disabled, note, onChange }: ToggleRowProps) {
  return (
    <label className={`gfx-toggle ${disabled ? "disabled" : ""}`} htmlFor={id}>
      <span>
        <b>{label}</b>
        <small>{note}</small>
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}
