import React from "react";
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
import { colors, spacing, radius, font, glow } from "@/src/theme";
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
  variant?: "primary" | "secondary" | "ghost";
  icon?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isPrimary && styles.btnPrimary,
        isPrimary && glow(colors.brand, 14),
        !isPrimary && !isGhost && styles.btnSecondary,
        isGhost && styles.btnGhost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onBrandPrimary : colors.brand} />
      ) : (
        <View style={styles.btnInner}>
          {icon}
          <Text
            style={[
              styles.btnLabel,
              { color: isPrimary ? colors.onBrandPrimary : isGhost ? colors.onSurfaceSecondary : colors.brand },
            ]}
          >
            {label}
          </Text>
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

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  btnPrimary: { backgroundColor: colors.brand },
  btnSecondary: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  btnGhost: { backgroundColor: "transparent" },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnLabel: { fontSize: font.lg, fontWeight: "800" },
  field: {
    height: 54,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.onSurface,
    fontSize: font.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
