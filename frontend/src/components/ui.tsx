import React, { useState } from "react";
import {
  Text,
  TextProps,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  View,
  ViewStyle,
  TextInput,
  TextInputProps,
  StyleProp,
} from "react-native";
import { colors, spacing, radius, font, chunky, softShadow } from "@/src/theme";
import { useI18n } from "@/src/i18n";

// RTL-aware text
export function RText(props: TextProps & { weight?: "regular" | "medium" | "bold" | "heavy" }) {
  const { isRTL } = useI18n();
  const { style, weight = "regular", ...rest } = props;
  const weightMap = { regular: "400", medium: "600", bold: "700", heavy: "800" } as const;
  return (
    <Text
      {...rest}
      style={[
        { color: colors.onSurface, fontWeight: weightMap[weight], textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" },
        style,
      ]}
    />
  );
}

const VARIANT_FILL: Record<"primary" | "secondary" | "success" | "ghost", string> = {
  primary: colors.brand,
  secondary: colors.surfaceSecondary,
  success: colors.success,
  ghost: "transparent",
};

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "success" | "ghost";
  icon?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false);
  const isGhost = variant === "ghost";
  const isSecondary = variant === "secondary";
  const fill = VARIANT_FILL[variant];
  const labelColor = variant === "primary" || variant === "success"
    ? colors.onBrandPrimary
    : isGhost ? colors.onSurfaceSecondary : colors.brand;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.btn,
        { backgroundColor: fill },
        isSecondary && { borderWidth: 1, borderColor: colors.border },
        !isGhost && chunky(fill === "transparent" ? colors.border : fill, pressed),
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <View style={styles.btnInner}>
          {icon}
          <Text style={[styles.btnLabel, { color: labelColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({ style, ...props }: TextInputProps) {
  const { isRTL } = useI18n();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[
        styles.field,
        { textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" },
        style,
      ]}
    />
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function ProgressBar({ progress, height = 8, color = colors.brand }: { progress: number; height?: number; color?: string }) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.progressTrack, { height, borderRadius: height / 2 }]}>
      <View style={[styles.progressFill, { width: `${p * 100}%`, height, borderRadius: height / 2, backgroundColor: color }]} />
    </View>
  );
}

// Single-select pill row used across mistake-reason, MCQ, and stream pickers.
export function OptionRow({
  label,
  selected,
  onPress,
  icon,
  testID,
  tone = "neutral",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  testID?: string;
  tone?: "neutral" | "success" | "error";
}) {
  const borderColor = selected ? (tone === "success" ? colors.success : tone === "error" ? colors.error : colors.brand) : colors.border;
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.optionRow, { borderColor, backgroundColor: selected ? colors.surfaceTertiary : colors.surface }]}>
      {icon}
      <RText weight={selected ? "bold" : "medium"} style={{ flex: 1, color: colors.onSurface }}>{label}</RText>
      <View style={[styles.radioOuter, selected && { borderColor: colors.brand }]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, selected && styles.chipActive]}>
      <RText weight="bold" style={{ color: selected ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontSize: font.base }}>
        {label}
      </RText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnLabel: { fontSize: font.lg, fontWeight: "800" },
  field: {
    height: 54,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.onSurface,
    fontSize: font.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...softShadow(),
  },
  progressTrack: { width: "100%", backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: {},
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
});
