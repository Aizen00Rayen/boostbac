import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font } from "@/src/theme";
import { RText, Card } from "@/src/components/ui";
import { PaperPlaneLoader } from "@/src/components/graphics";

type Stats = { students: number; exercises_captured: number; questions_answered: number; tests_taken: number };

export default function Admin() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api<Stats>("/admin/stats");
      setStats(s);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  if (loading) {
    return <View style={styles.centered}><PaperPlaneLoader label={t("loading")} /></View>;
  }

  const cards: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string }[] = stats
    ? [
        { label: t("adminStudents"), value: stats.students, icon: "people", color: colors.brand },
        { label: t("adminExercises"), value: stats.exercises_captured, icon: "camera", color: colors.success },
        { label: t("adminQuestionsAnswered"), value: stats.questions_answered, icon: "checkmark-done", color: colors.warning },
        { label: t("adminTestsTaken"), value: stats.tests_taken, icon: "school", color: colors.info },
      ]
    : [];

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
        <View style={styles.grid}>
          {cards.map((c) => (
            <Card key={c.label} style={styles.stat}>
              <Ionicons name={c.icon} size={22} color={c.color} />
              <RText weight="heavy" style={styles.statVal}>{c.value}</RText>
              <RText style={styles.statLabel}>{c.label}</RText>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { color: colors.onSurface, fontSize: font["2xl"] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stat: { width: "47%", alignItems: "center", paddingVertical: spacing.xl, gap: 6 },
  statVal: { color: colors.onSurface, fontSize: font["2xl"] },
  statLabel: { color: colors.muted, fontSize: font.sm, textAlign: "center" },
});
