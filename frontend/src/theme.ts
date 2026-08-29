// BoostBac design tokens — matches the "BoostBac Study Companion" Stitch design system
// exactly: Deep Boost Navy + Electric Boost Teal core, Golden Amber for milestones,
// Crimson for errors. Rounded (2), mobile-first, soft-shadow "tactile" identity built
// around the "Boo" mascot.
export const colors = {
  surface: "#F7F9FB",
  onSurface: "#0D2B52",
  surfaceSecondary: "#F2F4F6",
  onSurfaceSecondary: "#44474E",
  surfaceTertiary: "#D6E3FF",
  onSurfaceTertiary: "#006F79",
  surfaceInverse: "#0D2B52",
  onSurfaceInverse: "#FFFFFF",
  brand: "#008A96",
  brandPrimary: "#008A96",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#0D2B52",
  brandTertiary: "#D6E3FF",
  success: "#008A96",
  successDark: "#006F79",
  warning: "#FF9F1C",
  warningDark: "#D27F00",
  error: "#D90429",
  errorDark: "#93000A",
  errorTertiary: "#FFDAD6",
  info: "#7A93C0",
  border: "#E0E3E5",
  borderStrong: "#008A96",
  divider: "#E0E3E5",
  muted: "#74777F",
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
