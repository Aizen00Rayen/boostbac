import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Card } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";

type Teacher = { user_id: string; name: string; email: string; stream: string; status: string };
type Stats = { pending_teachers: number; approved_teachers: number; students: number; resources: number };

export default function Admin() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<Teacher[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api<Teacher[]>("/admin/teachers?status=pending"), api<Stats>("/admin/stats")]);
      setPending(p);
      setStats(s);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(id + action);
    try {
      await api(`/admin/teachers/${id}/${action}`, { method: "POST" });
      await load();
    } catch {} finally {
      setBusy("");
    }
  };

  const onLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  if (loading) {
    return <View style={styles.centered}><PaperPlaneLoader label={t("loading")} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <RText weight="heavy" style={styles.headerTitle}>{t("adminPanel")}</RText>
        <Pressable testID="admin-logout" onPress={onLogout} hitSlop={10}>
          <Ionicons name="log-out-outline" size={24} color={colors.error} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {stats && (
          <View style={styles.statsRow}>
            <Card style={styles.stat}><RText weight="heavy" style={styles.statVal}>{stats.students}</RText><RText style={styles.statLabel}>{t("students")}</RText></Card>
            <Card style={styles.stat}><RText weight="heavy" style={[styles.statVal, { color: colors.success }]}>{stats.approved_teachers}</RText><RText style={styles.statLabel}>{t("approvedT")}</RText></Card>
            <Card style={styles.stat}><RText weight="heavy" style={[styles.statVal, { color: colors.brand }]}>{stats.resources}</RText><RText style={styles.statLabel}>{t("posts")}</RText></Card>
          </View>
        )}

        <RText weight="heavy" style={styles.section}>{t("pendingTeachers")} ({pending.length})</RText>
        {pending.length === 0 ? (
          <Card style={styles.empty}>
            <PaperPlane size={36} color={colors.brand} />
            <RText weight="bold" style={{ color: colors.onSurfaceSecondary, marginTop: spacing.md }}>{t("noPending")}</RText>
          </Card>
        ) : (
          <View style={{ gap: spacing.md }}>
            {pending.map((tch) => (
              <Card key={tch.user_id} testID={`pending-${tch.user_id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View style={styles.avatar}><RText weight="heavy" style={{ color: colors.onBrandPrimary }}>{(tch.name || "?").charAt(0).toUpperCase()}</RText></View>
                  <View style={{ flex: 1 }}>
                    <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg }}>{tch.name}</RText>
                    <RText style={{ color: colors.muted, fontSize: font.sm }}>{tch.email} · {tch.stream}</RText>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                  <PrimaryButton testID={`reject-${tch.user_id}`} variant="secondary" label={t("reject")} onPress={() => decide(tch.user_id, "reject")} loading={busy === tch.user_id + "reject"} style={{ flex: 1 }} />
                  <PrimaryButton testID={`approve-${tch.user_id}`} label={t("approve")} onPress={() => decide(tch.user_id, "approve")} loading={busy === tch.user_id + "approve"} style={{ flex: 1 }} />
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { color: colors.onSurface, fontSize: font["2xl"] },
  statsRow: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, alignItems: "center", paddingVertical: spacing.lg },
  statVal: { color: colors.onSurface, fontSize: font["2xl"] },
  statLabel: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  section: { color: colors.onSurface, fontSize: font.xl, marginVertical: spacing.lg },
  empty: { alignItems: "center", paddingVertical: spacing["2xl"] },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
