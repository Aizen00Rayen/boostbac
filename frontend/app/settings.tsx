import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, Card } from "@/src/components/ui";

export default function Settings() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="settings-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <View style={styles.iconBtn} />
      </View>

      <View style={{ padding: spacing.lg }}>
        <Card style={{ alignItems: "center", paddingVertical: spacing.xl, marginBottom: spacing.lg }}>
          <View style={styles.avatar}>
            <RText weight="heavy" style={{ color: colors.onBrandPrimary, fontSize: font.xl }}>
              {(user?.nickname || user?.name || "?").charAt(0).toUpperCase()}
            </RText>
          </View>
          <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg, marginTop: spacing.md }}>
            {user?.nickname || user?.name}
          </RText>
          <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 2 }}>{user?.email}</RText>
        </Card>

        <Pressable testID="settings-logout" onPress={onLogout} style={styles.logoutRow}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <RText weight="bold" style={{ color: colors.error }}>{t("logout")}</RText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  logoutRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.errorTertiary },
});
