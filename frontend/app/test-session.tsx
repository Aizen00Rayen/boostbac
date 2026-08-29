import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Card, OptionRow, ProgressBar } from "@/src/components/ui";
import { formatExerciseText } from "@/src/utils/formatText";

type TestQuestion = { index: number; question_text: string; options: string[]; skill_tag: string };
type TestResult = { score: number; correct: number; total: number; improved_skills: string[]; weak_skills: string[] };

export default function TestSession() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useLocalSearchParams<{ data: string }>();
  const parsed = useMemo(() => JSON.parse(data) as { test_id: string; mode: string; questions: TestQuestion[] }, [data]);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<{ index: number; selected_index: number }[]>([]);
  const [result, setResult] = useState<TestResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const q = parsed.questions[index];

  const next = async () => {
    if (selected === null) return;
    Haptics.selectionAsync();
    const nextAnswers = [...answers, { index: q.index, selected_index: selected }];
    setAnswers(nextAnswers);
    setSelected(null);
    if (index + 1 >= parsed.questions.length) {
      setSubmitting(true);
      try {
        const res = await api<TestResult>(`/tests/${parsed.test_id}/submit`, { method: "POST", body: { answers: nextAnswers } });
        setResult(res);
      } catch {
        setResult({ score: 0, correct: 0, total: parsed.questions.length, improved_skills: [], weak_skills: [] });
      } finally {
        setSubmitting(false);
      }
    } else {
      setIndex((i) => i + 1);
    }
  };

  if (result) {
    return (
      <View style={[styles.centered, { padding: spacing.xl }]} testID="test-results">
        <RText weight="heavy" style={styles.resultsTitle}>{t("testResultsTitle")}</RText>
        <RText style={{ color: colors.onSurfaceSecondary, marginTop: 4 }}>{t("testResultsSubtitle")}</RText>

        <Card style={{ alignItems: "center", marginTop: spacing.xl, width: "100%", paddingVertical: spacing.xl }}>
          <View style={styles.medal}><Ionicons name="ribbon" size={28} color={colors.onBrandPrimary} /></View>
          <RText weight="heavy" style={styles.scoreText}>{result.correct}/{result.total}</RText>
          <View style={{ width: "100%", marginTop: spacing.md }}>
            <ProgressBar progress={result.total ? result.correct / result.total : 0} height={10} />
          </View>
          <RText weight="medium" style={{ color: colors.brand, marginTop: spacing.sm }}>{t("testOnTrack")}</RText>
        </Card>

        {result.improved_skills.length > 0 && (
          <Card style={{ marginTop: spacing.lg, width: "100%" }}>
            <View style={styles.rowBetween}>
              <Ionicons name="trending-up" size={18} color={colors.success} />
              <RText weight="bold" style={{ color: colors.onSurface, flex: 1, marginStart: 8 }}>{t("testImprovedIn")}</RText>
            </View>
            <View style={styles.chipWrap}>
              {result.improved_skills.map((s) => (
                <View key={s} style={[styles.skillChip, { backgroundColor: colors.brandTertiary }]}>
                  <RText weight="medium" style={{ color: colors.onSurfaceTertiary, fontSize: font.sm }}>{s}</RText>
                </View>
              ))}
            </View>
          </Card>
        )}

        {result.weak_skills.length > 0 && (
          <Card style={{ marginTop: spacing.md, width: "100%" }}>
            <View style={styles.rowBetween}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
              <RText weight="bold" style={{ color: colors.onSurface, flex: 1, marginStart: 8 }}>{t("testStillWeakIn")}</RText>
            </View>
            <View style={styles.chipWrap}>
              {result.weak_skills.map((s) => (
                <View key={s} style={[styles.skillChip, { backgroundColor: colors.errorTertiary }]}>
                  <RText weight="medium" style={{ color: colors.errorDark, fontSize: font.sm }}>{s}</RText>
                </View>
              ))}
            </View>
          </Card>
        )}

        <PrimaryButton testID="test-finish" label={t("testFinish")} onPress={() => router.replace("/(tabs)/you")} style={{ marginTop: spacing.xl, width: "100%" }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <RText weight="bold" style={{ color: colors.onSurfaceSecondary }}>{t("testQuestionProgress", { i: index + 1, n: parsed.questions.length })}</RText>
        <Pressable testID="test-session-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {parsed.mode === "weak_spots" && (
          <View style={styles.weakBadge}>
            <RText weight="bold" style={{ color: colors.errorDark, fontSize: font.sm }}>{q.skill_tag}</RText>
          </View>
        )}
        <Card style={{ marginTop: spacing.md }}>
          <RText weight="medium" style={styles.qText}>{formatExerciseText(q.question_text)}</RText>
        </Card>

        <RText weight="bold" style={styles.chooseLabel}>{t("testChooseAnswer")}</RText>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {q.options.map((opt, i) => (
            <OptionRow key={i} testID={`test-option-${i}`} label={opt} selected={selected === i} onPress={() => setSelected(i)} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton
          testID="test-next"
          label={t("next")}
          icon={<Ionicons name="arrow-back" size={18} color={colors.onBrandPrimary} />}
          disabled={selected === null}
          loading={submitting}
          onPress={next}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  weakBadge: { alignSelf: "flex-start", backgroundColor: colors.errorTertiary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  qText: { color: colors.onSurface, fontSize: font.lg, lineHeight: 26 },
  chooseLabel: { color: colors.onSurfaceSecondary, fontSize: font.sm, marginTop: spacing.lg },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  resultsTitle: { color: colors.onSurface, fontSize: font["2xl"] },
  medal: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  scoreText: { color: colors.onSurface, fontSize: font["3xl"], marginTop: spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "center" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  skillChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
});
