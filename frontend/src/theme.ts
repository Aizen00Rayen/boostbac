// BoostBac design tokens — dark-first, cyan-teal accent.
export const colors = {
  surface: "#0A1420",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#152336",
  onSurfaceSecondary: "#C9EEFA",
  surfaceTertiary: "#1C2E45",
  onSurfaceTertiary: "#2DD4E8",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0A1420",
  brand: "#2DD4E8",
  brandPrimary: "#2DD4E8",
  onBrandPrimary: "#0A1420",
  brandSecondary: "#158C9B",
  brandTertiary: "#0F3B45",
  success: "#34D399",
  warning: "#FBBF24",
  error: "#F87171",
  info: "#60A5FA",
  border: "#1C2E45",
  borderStrong: "#2DD4E8",
  divider: "#152336",
  muted: "#5B7089",
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

// glow shadow for accent elements
export const glow = (color: string = colors.brand, radius = 16) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.55,
  shadowRadius: radius,
  elevation: 8,
});
