// BoostBac design tokens — light, Duolingo-inspired, cyan-teal brand identity
// (matches the paper-airplane logo's navy outline + cyan accents).
export const colors = {
  surface: "#FFFFFF",
  onSurface: "#16283A",
  surfaceSecondary: "#F3F7F9",
  onSurfaceSecondary: "#48607A",
  surfaceTertiary: "#E9F6F7",
  onSurfaceTertiary: "#0E7C8C",
  surfaceInverse: "#16283A",
  onSurfaceInverse: "#FFFFFF",
  brand: "#0EA5B8",
  brandPrimary: "#0EA5B8",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#0C7A85",
  brandTertiary: "#DFF6F8",
  success: "#3BB54A",
  successDark: "#2C9138",
  warning: "#F5A623",
  warningDark: "#C77F12",
  error: "#EF4444",
  errorDark: "#C22E2E",
  errorTertiary: "#FDEBEB",
  info: "#3B82F6",
  border: "#E2E8EE",
  borderStrong: "#0EA5B8",
  divider: "#EEF2F5",
  muted: "#94A3AF",
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
