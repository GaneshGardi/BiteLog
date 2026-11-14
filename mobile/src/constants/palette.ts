/**
 * BiteLog colour tokens.
 *
 * `dark` is exactly what the app uses today.
 * `light` is the proposed "Playful Premium" cream + pastel theme.
 *
 * To try the light theme in every component that imports `colors`,
 * change the last line to:  export const colors: Palette = light;
 */
export type Palette = {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  /** Fill colour (buttons, progress, dots). Always pair with `onAccent` text. */
  accent: string;
  onAccent: string;
  /** Accent for text/icons on soft tiles. Darker in light mode for contrast. */
  accentInk: string;
  accentSoft: string;
  warm: string;
  gold: string;
  silver: string;
  bronze: string;
  overlay: string;
  // Pastels: light theme uses them for tiles; dark theme maps them to muted tints.
  lavender: string;
  mint: string;
  peach: string;
  butter: string;
};

export const dark: Palette = {
  bg: "#101010",
  card: "#1A1A1A",
  border: "#303030",
  text: "#FFFFFF",
  muted: "#999999",
  accent: "#B6F36B",
  onAccent: "#101010",
  accentInk: "#B6F36B",
  accentSoft: "#29351F",
  warm: "#FF9A76",
  gold: "#FFD166",
  silver: "#C9CED6",
  bronze: "#E8A06E",
  overlay: "rgba(0,0,0,0.62)",
  lavender: "#29351F",
  mint: "#29351F",
  peach: "#3A2A22",
  butter: "#3A3420",
};

export const light: Palette = {
  bg: "#FFF9F0",
  card: "#FFFFFF",
  border: "#F0E6D6",
  text: "#2B2433",
  muted: "#8C8496",
  accent: "#B6F36B",
  onAccent: "#23301A",
  accentInk: "#3F7A0F",
  accentSoft: "#E9F9CF",
  warm: "#FF8A63",
  gold: "#FFC93C",
  silver: "#C4C9D2",
  bronze: "#E39A62",
  overlay: "rgba(43,36,51,0.45)",
  lavender: "#E8E1FF",
  mint: "#D6F5E4",
  peach: "#FFE2D2",
  butter: "#FFF0B8",
};

export const colors: Palette = dark;
