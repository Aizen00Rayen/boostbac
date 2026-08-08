import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton } from "@/src/components/ui";
import { PaperPlaneLoader } from "@/src/components/graphics";

export default function Pending() {
  const { t } = useI18n();
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const rejected = user?.status === "rejected";

  const onRefresh = async () => {
    await refresh();
    router.replace("/");
  };

  const onLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F3B45", colors.surface]} style={StyleSheet.absoluteFill} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} />
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xl }}>
          {rejected ? (
            <View style={styles.iconCircle}>
              <Ionicons name="close-circle" size={56} color={colors.error} />
            </View>
          ) : (
            <PaperPlaneLoader size={54} />
          )}
          <RText weight="heavy" style={styles.title}>
            {t(rejected ? "rejectedTitle" : "pendingTitle")}
          </RText>
          <RText weight="regular" style={styles.sub}>
            {t("pendingSub")}
          </RText>
        </View>
        <View style={{ gap: spacing.md }}>
          <PrimaryButton testID="pending-refresh" label={t("refreshStatus")} onPress={onRefresh} />
          <Pressable testID="pending-logout" onPress={onLogout} style={{ paddingVertical: spacing.md }}>
            <RText weight="bold" style={{ color: colors.onSurfaceSecondary, textAlign: "center" }}>{t("logout")}</RText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, paddingHorizontal: spacing.xl },
  iconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: font["2xl"], textAlign: "center" },
  sub: { color: colors.onSurfaceSecondary, fontSize: font.lg, textAlign: "center", lineHeight: 26 },
});
