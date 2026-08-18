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
});
