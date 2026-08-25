// BoostBac design tokens — light, Duolingo-inspired identity built around the
// "Boo" mascot brand kit: Boost Navy + Boost Teal core, with Butter/Coral/Lime
// as the semantic warning/error/success accents (colors verified against the
// actual mascot/logo artwork, not just the brand-guide swatch labels — a couple
// of printed hex labels in that guide didn't match their own rendered assets).
export const colors = {
  surface: "#FFFFFF",
  onSurface: "#102A4C",
  surfaceSecondary: "#F7F7F2",
  onSurfaceSecondary: "#4A5A70",
  surfaceTertiary: "#D9F3F3",
  onSurfaceTertiary: "#076B78",
  surfaceInverse: "#102A4C",
  onSurfaceInverse: "#FFFFFF",
  brand: "#0797A3",
  brandPrimary: "#0797A3",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#076372",
  brandTertiary: "#D9F3F3",
  success: "#8FBF3F",
  successDark: "#6E9930",
  warning: "#F4D96B",
  warningDark: "#C7A93A",
  error: "#FF6B61",
  errorDark: "#D6473E",
  errorTertiary: "#FFEAE8",
  info: "#AFA5FF",
  border: "#EBEEF0",
  borderStrong: "#0797A3",
  divider: "#EBEEF0",
  muted: "#8A97A8",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

export const font = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 40,
};

// Darken a "#RRGGBB" hex color by `amount` (0-1). Used to derive the offset
// bottom-border shade for the chunky Duolingo-style "3D" button/card look.
export function darken(hex: string, amount: number = 0.18): string {
  const n = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(n.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(n.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(n.slice(4, 6), 16) * (1 - amount)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Soft elevation shadow for cards/surfaces (replaces the old dark-theme glow).
export const softShadow = (opacity: number = 0.08, radius: number = 10) => ({
  shadowColor: "#0F2733",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation: 3,
});

// Duolingo's signature chunky "3D" button: a solid bottom border in a darker
// shade of the fill color, which shrinks away on press to read as "pushed in".
export const chunky = (color: string = colors.brand, pressed: boolean = false, height: number = 4) => ({
  borderBottomWidth: pressed ? 0 : height,
  borderBottomColor: darken(color, 0.22),
  transform: pressed ? [{ translateY: height }] : [{ translateY: 0 }],
});

// Colored glow for celebratory/accent moments (badges, streak flame, node unlock).
export const glow = (color: string = colors.brand, radius: number = 16) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.35,
  shadowRadius: radius,
  elevation: 8,
});
