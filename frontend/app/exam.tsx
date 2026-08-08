import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Card } from "@/src/components/ui";
import { PaperPlaneLoader, PaperPlane } from "@/src/components/graphics";

type Q = { card_id: string; question: string; answer: string; subject: string; topic: string };
type Result = { card_id: string; subject: string; correct: boolean };
type Breakdown = { subject: string; total: number; correct: number; accuracy: number };

export default function Exam() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { num } = useLocalSearchParams<{ num?: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [examId, setExamId] = useState("");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [finished, setFinished] = useState(false);
  const [final, setFinal] = useState<{ score: number; correct: number; total: number; breakdown: Breakdown[]; xp_earned: number } | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ exam_id: string; questions: Q[] }>("/exams/generate", { method: "POST", body: { num_questions: Number(num) || 10 } });
        setExamId(res.exam_id);
        setQuestions(res.questions);
      } catch (e: any) {
        setError(e?.message || "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, [num]);

  useEffect(() => {
    if (!loading && !finished && questions.length > 0) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [loading, finished, questions.length]);

  const submitExam = useCallback(async (allResults: Result[]) => {
    clearInterval(timerRef.current);
    try {
      const res = await api<any>("/exams/submit", { method: "POST", body: { exam_id: examId, results: allResults, duration_seconds: seconds } });
      setFinal(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message || "Error");
    }
    setFinished(true);
  }, [examId, seconds]);

  const grade = (correct: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const q = questions[index];
    const next = [...results, { card_id: q.card_id, subject: q.subject, correct }];
    setResults(next);
    setRevealed(false);
    if (index + 1 >= questions.length) submitExam(next);
    else setIndex(index + 1);
  };

  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperPlaneLoader label={t("generating")} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <PaperPlane size={40} color={colors.muted} />
        <RText style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginVertical: spacing.lg }}>{error}</RText>
        <PrimaryButton testID="exam-back" label={t("backHome")} variant="secondary" onPress={() => router.back()} style={{ width: 220 }} />
      </View>
    );
  }

  if (finished && final) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable testID="exam-close" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color={colors.onSurfaceSecondary} />
          </Pressable>
          <RText weight="heavy" style={styles.headerTitle}>{t("examResults")}</RText>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <Card style={styles.scoreHero}>
            <RText weight="heavy" style={{ color: final.score >= 60 ? colors.success : colors.warning, fontSize: 60 }}>
              {final.score}%
            </RText>
            <RText weight="bold" style={{ color: colors.onSurface }}>
              {final.correct}/{final.total} · {t("time")} {mmss(seconds)}
            </RText>
            <View style={styles.xpTag}>
              <Ionicons name="flash" size={16} color={colors.warning} />
              <RText weight="heavy" style={{ color: colors.warning }}>+{final.xp_earned} XP</RText>
            </View>
          </Card>
          <RText weight="heavy" style={styles.sectionTitle}>{t("breakdown")}</RText>
          <View style={{ gap: spacing.sm }}>
            {final.breakdown.map((b) => (
              <Card key={b.subject} style={styles.bRow}>
                <RText weight="medium" style={{ color: colors.onSurface, flex: 1 }}>{b.subject}</RText>
                <RText weight="bold" style={{ color: b.accuracy >= 0.6 ? colors.success : colors.warning }}>
                  {b.correct}/{b.total} · {Math.round(b.accuracy * 100)}%
                </RText>
              </Card>
            ))}
          </View>
          <PrimaryButton testID="exam-done" label={t("backHome")} onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
        </ScrollView>
      </View>
    );
  }

  const q = questions[index];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="exam-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.onSurfaceSecondary} />
        </Pressable>
        <View style={styles.timerChip}>
          <Ionicons name="time-outline" size={16} color={colors.brand} />
          <RText weight="heavy" style={{ color: colors.onSurface }}>{mmss(seconds)}</RText>
        </View>
        <RText weight="bold" style={{ color: colors.onSurfaceSecondary, width: 60, textAlign: "right" }}>
          {index + 1}/{questions.length}
        </RText>
      </View>

      <ScrollView contentContainerStyle={styles.qArea} showsVerticalScrollIndicator={false}>
        <View style={styles.subjectTag}>
          <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{q.subject} · {q.topic}</RText>
        </View>
        <RText weight="bold" style={styles.qText}>{q.question}</RText>

        {revealed && (
          <Card style={styles.answerCard} testID="exam-answer">
            <RText weight="bold" style={{ color: colors.onSurfaceSecondary, marginBottom: spacing.sm }}>{t("answer")}</RText>
            <RText weight="medium" style={{ color: colors.onSurface, fontSize: font.lg, lineHeight: 28 }}>{q.answer}</RText>
          </Card>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {!revealed ? (
          <PrimaryButton testID="exam-reveal" label={t("showAnswer")} onPress={() => setRevealed(true)} />
        ) : (
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <PrimaryButton testID="exam-missed" variant="secondary" label={t("missedIt")} onPress={() => grade(false)} style={{ flex: 1 }} icon={<Ionicons name="close" size={18} color={colors.error} />} />
            <PrimaryButton testID="exam-got" label={t("gotIt")} onPress={() => grade(true)} style={{ flex: 1 }} icon={<Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} />} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  headerTitle: { color: colors.onSurface, fontSize: font.lg },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  timerChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  qArea: { padding: spacing.lg, flexGrow: 1 },
  subjectTag: { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  qText: { color: colors.onSurface, fontSize: font["2xl"], lineHeight: 36, marginTop: spacing.lg },
  answerCard: { marginTop: spacing.xl, backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  scoreHero: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  xpTag: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontSize: font.xl, marginVertical: spacing.lg },
  bRow: { flexDirection: "row", alignItems: "center" },
});
