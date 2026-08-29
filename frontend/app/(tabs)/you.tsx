import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Card } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";

type WeeklyHighlight = { subject: string; correct: number; total: number; accuracy: number } | null;
type SubjectPulse = { subject: string; dots: boolean[] };
type RecurringMistake = { skill_tag: string; mistake_reason: string; count: number };
type Progress = {
  zero_data: boolean;
  current_streak: number;
  weekly_highlight: WeeklyHighlight;
  subject_pulse: SubjectPulse[];
  recurring_mistakes: RecurringMistake[];
};

export default function YouTab() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<Progress>("/progress");
      setData(res);
    } catch {
      // keep last-known data on a transient refresh failure, but never leave a
      // first load stuck on the spinner forever with nothing to show.
      setData((prev) => prev ?? { zero_data: true, current_streak: 0, weekly_highlight: null, subject_pulse: [], recurring_mistakes: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return <View style={styles.centered}><PaperPlaneLoader label={t("loading")} /></View>;
  }

  if (data.zero_data) {
    return (
      <View style={styles.container}>
        <View style={[styles.padTop, { paddingTop: insets.top + spacing.lg }]}>
          <RText weight="heavy" style={styles.greeting}>{t("youZeroGreeting")}</RText>
          <RText style={styles.subtitle}>{t("youZeroSubtitle")}</RText>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <Card style={{ alignItems: "center", paddingVertical: spacing.xl }}>
            <PaperPlane size={64} />
            <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg, marginTop: spacing.md, textAlign: "center" }}>{t("youZeroCardTitle")}</RText>
            <RText style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.xs }}>{t("youZeroCardBody")}</RText>
            <PrimaryButton testID="you-start-now" label={t("youStartNow")} onPress={() => router.push("/capture")} style={{ marginTop: spacing.lg, width: "100%" }} />
          </Card>

          <EmptySection icon="hourglass-outline" title={t("youStudyTimeTitle")} body={t("youStudyTimeEmpty")} />
          <EmptySection icon="sparkles-outline" title={t("youStrengthsTitle")} body={t("youStrengthsEmpty")} />
          <EmptySection icon="search-outline" title={t("youMistakePatternsTitle")} body={t("youMistakePatternsEmpty")} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <View style={styles.headerRow}>
          <RText weight="heavy" style={styles.title}>{t("youWeeklyTitle")}</RText>
          <View style={styles.streakChip}>
            <Ionicons name="flame" size={14} color={colors.warning} />
            <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.sm }}>{t("youStreakDays", { n: data.current_streak })}</RText>
          </View>
        </View>

        <PrimaryButton
          testID="you-open-tests"
          label={t("testTitle")}
          variant="secondary"
          icon={<Ionicons name="school-outline" size={18} color={colors.brand} />}
          onPress={() => router.push("/test")}
          style={{ marginTop: spacing.md }}
        />

        {data.weekly_highlight ? (
          <Card style={{ marginTop: spacing.lg }}>
            <View style={styles.rowStart}>
              <Ionicons name="trending-up" size={20} color={colors.brand} />
              <RText weight="bold" style={{ color: colors.onSurface, marginStart: 8, fontSize: font.lg }}>{t("youProgressCardTitle")}</RText>
            </View>
            <RText style={{ color: colors.onSurfaceSecondary, marginTop: spacing.sm, lineHeight: 22 }}>
              {t("youProgressCardBody", {
                correct: data.weekly_highlight.correct, total: data.weekly_highlight.total, subject: data.weekly_highlight.subject,
              })}
            </RText>
            <View style={{ marginTop: spacing.md }}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(data.weekly_highlight.accuracy * 100)}%` }]} />
              </View>
            </View>
          </Card>
        ) : (
          <EmptySection icon="trending-up-outline" title={t("youProgressCardTitle")} body={t("youStrengthsEmpty")} style={{ marginTop: spacing.lg }} />
        )}

        <RText weight="bold" style={styles.sectionTitle}>{t("youPulseTitle")}</RText>
        {data.subject_pulse.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {data.subject_pulse.map((sp) => (
              <Card key={sp.subject} style={styles.pulseRow}>
                <RText weight="medium" style={{ color: colors.onSurface, flex: 1 }}>{sp.subject}</RText>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {sp.dots.map((ok, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: ok ? colors.success : colors.error }]} />
                  ))}
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <EmptySection icon="pulse-outline" title={t("youPulseTitle")} body={t("youStrengthsEmpty")} />
        )}

        <RText weight="bold" style={styles.sectionTitle}>{t("youRecurringTitle")}</RText>
        {data.recurring_mistakes.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {data.recurring_mistakes.map((m, i) => (
              <Card key={i} style={styles.pulseRow}>
                <Ionicons name="alert-circle" size={18} color={colors.warning} />
                <RText weight="medium" style={{ color: colors.onSurface, marginStart: spacing.sm, flex: 1 }}>{m.skill_tag}</RText>
                <RText style={{ color: colors.muted, fontSize: font.sm }}>{t(`mistake_${m.mistake_reason}`)}</RText>
              </Card>
            ))}
          </View>
        ) : (
          <EmptySection icon="search-outline" title={t("youMistakePatternsTitle")} body={t("youMistakePatternsEmpty")} />
        )}
      </ScrollView>
    </View>
  );
}

function EmptySection({ icon, title, body, style }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; style?: any }) {
  return (
    <Card style={[{ marginTop: spacing.lg }, style]}>
      <View style={styles.rowStart}>
        <Ionicons name={icon} size={18} color={colors.muted} />
        <RText weight="bold" style={{ color: colors.onSurface, marginStart: 8 }}>{title}</RText>
      </View>
      <RText style={{ color: colors.muted, marginTop: spacing.xs, fontSize: font.sm, lineHeight: 20 }}>{body}</RText>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  padTop: { paddingHorizontal: spacing.lg },
  greeting: { color: colors.onSurface, fontSize: font["2xl"] },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: font.base, marginTop: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.onSurface, fontSize: font["2xl"] },
  streakChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  sectionTitle: { color: colors.onSurface, fontSize: font.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  rowStart: { flexDirection: "row", alignItems: "center" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },
  pulseRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
