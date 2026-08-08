import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, useWindowDimensions, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, Card } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader, ForgettingCurve } from "@/src/components/graphics";

type Heat = { subject: string; accuracy: number; reviews: number };
type Analytics = {
  heatmap: Heat[];
  forgetting_curve: { label: string; retention: number | null }[];
  focus_subjects: Heat[];
  total_reviews: number;
  overall_accuracy: number;
  total_cards: number;
};

function accColor(a: number) {
  if (a >= 0.8) return colors.success;
  if (a >= 0.6) return colors.brand;
  if (a >= 0.4) return colors.warning;
  return colors.error;
}

export default function Dashboard() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Analytics>("/analytics");
      setData(d);
    } catch {
      // ignore
    } finally {
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
  const hasData = d.total_reviews > 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <RText weight="heavy" style={styles.headerTitle}>
          {t("dashboard")}
        </RText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {!hasData ? (
          <Card style={styles.emptyCard}>
            <PaperPlane size={40} color={colors.brand} />
            <RText weight="bold" style={{ color: colors.onSurface, marginTop: spacing.md, fontSize: font.lg }}>
              {t("noAnalytics")}
            </RText>
            <RText style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 4 }}>
              {t("noAnalyticsSub")}
            </RText>
          </Card>
        ) : (
          <>
            {/* KPI row */}
            <View style={styles.kpiRow}>
              <Card style={styles.kpi}>
                <RText weight="heavy" style={[styles.kpiVal, { color: accColor(d.overall_accuracy) }]}>
                  {Math.round(d.overall_accuracy * 100)}%
                </RText>
                <RText style={styles.kpiLabel}>{t("overallAccuracy")}</RText>
              </Card>
              <Card style={styles.kpi}>
                <RText weight="heavy" style={[styles.kpiVal, { color: colors.brand }]}>
                  {d.total_reviews}
                </RText>
                <RText style={styles.kpiLabel}>{t("totalReviews")}</RText>
              </Card>
            </View>

            {/* Focus today */}
            {d.focus_subjects.length > 0 && (
              <Card style={styles.focusCard}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="flame" size={18} color={colors.warning} />
                  <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg }}>
                    {t("focusToday")}
                  </RText>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
                  {d.focus_subjects.map((f) => (
                    <View key={f.subject} style={styles.focusChip}>
                      <RText weight="bold" style={{ color: colors.warning }}>
                        {f.subject}
                      </RText>
                      <RText style={{ color: colors.onSurfaceSecondary, fontSize: font.sm }}>
                        {Math.round(f.accuracy * 100)}%
                      </RText>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {/* Forgetting curve */}
            <Card style={{ marginTop: spacing.md }}>
              <RText weight="bold" style={styles.cardTitle}>
                {t("forgettingCurve")}
              </RText>
              <View style={{ marginTop: spacing.md }}>
                <ForgettingCurve data={d.forgetting_curve} width={width - spacing.lg * 2 - spacing.lg * 2} height={170} />
              </View>
              <View style={styles.axisRow}>
                {d.forgetting_curve.filter((_, i) => i % 3 === 0).map((p, i) => (
                  <RText key={i} style={styles.axisLabel}>
                    {p.label}
                  </RText>
                ))}
              </View>
            </Card>

            {/* Heatmap */}
            <Card style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <RText weight="bold" style={styles.cardTitle}>
                  {t("weaknessMap")}
                </RText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                  <RText style={styles.axisLabel}>{t("weak")}</RText>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <RText style={styles.axisLabel}>{t("strong")}</RText>
                </View>
              </View>
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {d.heatmap.map((h) => (
                  <View key={h.subject} style={styles.heatRow} testID={`heat-${h.subject}`}>
                    <RText weight="medium" style={{ color: colors.onSurface, width: 110 }} numberOfLines={1}>
                      {h.subject}
                    </RText>
                    <View style={styles.heatBarBg}>
                      <View style={[styles.heatBarFill, { width: `${Math.max(6, h.accuracy * 100)}%`, backgroundColor: accColor(h.accuracy) }]} />
                    </View>
                    <RText weight="bold" style={{ color: accColor(h.accuracy), width: 44, textAlign: "right" }}>
                      {Math.round(h.accuracy * 100)}%
                    </RText>
                  </View>
                ))}
              </View>
            </Card>
          </>
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
  emptyCard: { alignItems: "center", paddingVertical: spacing["3xl"] },
  kpiRow: { flexDirection: "row", gap: spacing.md },
  kpi: { flex: 1, alignItems: "center", paddingVertical: spacing.lg },
  kpiVal: { fontSize: font["3xl"] },
  kpiLabel: { color: colors.muted, fontSize: font.sm, marginTop: 4, textAlign: "center" },
  focusCard: { marginTop: spacing.md, borderColor: colors.warning, borderWidth: 1 },
  focusChip: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: "center", gap: 2 },
  cardTitle: { color: colors.onSurface, fontSize: font.lg },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  axisLabel: { color: colors.muted, fontSize: font.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  heatRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heatBarBg: { flex: 1, height: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  heatBarFill: { height: "100%", borderRadius: radius.pill },
});
