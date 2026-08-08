import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, Card } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";

type Row = { user_id: string; name: string; picture?: string; weekly_xp: number; rank: number; is_me: boolean };
type LB = { leaderboard: Row[]; me: Row; total_players: number };

const MEDAL = ["#FBBF24", "#C9EEFA", "#B08D57"];

export default function Leaderboard() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<LB | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<LB>("/leaderboard");
      setData(d);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperPlaneLoader label={t("loading")} />
      </View>
    );
  }

  const d = data!;
  const empty = d.leaderboard.length === 0;

  const initial = (n: string) => (n || "?").charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <RText weight="heavy" style={styles.headerTitle}>{t("weeklyRanking")}</RText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {/* My rank hero */}
        <Card style={styles.meCard}>
          <LinearGradient colors={["#0F3B45", colors.surfaceSecondary]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <RText weight="bold" style={{ color: colors.onSurfaceSecondary }}>{t("yourRank")}</RText>
              <RText weight="heavy" style={styles.meRank}>#{d.me.rank}</RText>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={styles.xpTag}>
                <Ionicons name="flash" size={16} color={colors.warning} />
                <RText weight="heavy" style={{ color: colors.warning, fontSize: font.lg }}>{d.me.weekly_xp}</RText>
              </View>
              <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 4 }}>{t("weeklyXP")}</RText>
            </View>
          </View>
          <RText style={{ color: colors.onSurfaceSecondary, marginTop: spacing.md, fontSize: font.sm }}>
            {d.total_players} {t("players")} · {t("rankHint")}
          </RText>
        </Card>

        {empty ? (
          <Card style={styles.emptyCard}>
            <PaperPlane size={40} color={colors.brand} />
            <RText weight="bold" style={{ color: colors.onSurface, marginTop: spacing.md, textAlign: "center", fontSize: font.lg }}>
              {t("noLeaderboard")}
            </RText>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {d.leaderboard.map((r) => (
              <View
                key={r.user_id}
                testID={`lb-row-${r.rank}`}
                style={[styles.row, r.is_me && styles.rowMe, r.rank <= 3 && glow(MEDAL[r.rank - 1], 6)]}
              >
                <View style={styles.rankBox}>
                  {r.rank <= 3 ? (
                    <Ionicons name="medal" size={24} color={MEDAL[r.rank - 1]} />
                  ) : (
                    <RText weight="heavy" style={{ color: colors.muted, fontSize: font.lg }}>{r.rank}</RText>
                  )}
                </View>
                <View style={[styles.avatar, r.is_me && { backgroundColor: colors.brand }]}>
                  {r.picture ? (
                    <Image source={{ uri: r.picture }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  ) : (
                    <RText weight="heavy" style={{ color: r.is_me ? colors.onBrandPrimary : colors.onSurface }}>{initial(r.name)}</RText>
                  )}
                </View>
                <RText weight="bold" style={{ color: colors.onSurface, flex: 1, marginHorizontal: spacing.md }} numberOfLines={1}>
                  {r.name}{r.is_me ? " ✦" : ""}
                </RText>
                <View style={styles.xpChip}>
                  <Ionicons name="flash" size={13} color={colors.warning} />
                  <RText weight="heavy" style={{ color: colors.onSurface, fontSize: font.base }}>{r.weekly_xp}</RText>
                </View>
              </View>
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
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { color: colors.onSurface, fontSize: font["2xl"] },
  meCard: { overflow: "hidden" },
  meRank: { color: colors.brand, fontSize: 44, lineHeight: 48 },
  xpTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  emptyCard: { alignItems: "center", paddingVertical: spacing["3xl"], marginTop: spacing.md },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowMe: { borderColor: colors.brand, backgroundColor: colors.surfaceTertiary },
  rankBox: { width: 32, alignItems: "center", justifyContent: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginLeft: spacing.sm },
  xpChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
});
