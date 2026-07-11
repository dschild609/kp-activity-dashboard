// The fixed "KP Training Template" slide palette — slides are branded
// artifacts, not UI chrome, so these never follow the app theme. Shared by
// the slide renderer (SlideView) and the interactive deck players so the
// employee-facing surfaces can't drift from the template.

export const INK = "#13202b";
export const CRIMSON = "#94002a";
export const CREAM = "#f5f4ef";
export const MUTED = "#5b6770";
export const HAIRLINE = "#e3e1d8";

/* The 🎯 find-it instruction chip on hotspot slides (editor + player). */
export const HOTSPOT_CHIP_STYLE = {
  background: "rgba(148,0,42,.08)",
  border: "1px solid rgba(148,0,42,.25)",
  color: INK,
} as const;
