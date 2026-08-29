import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useI18n, MISTAKE_REASONS, MistakeReason } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Card, OptionRow } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";
import { formatExerciseText } from "@/src/utils/formatText";

type ReviewItem = { review_item_id: string; subject: string; skill_tag: string; item_type: string; item_content: string };
type Step = "loading" | "question" | "reveal" | "mistake" | "summary" | "empty";

const BADGE_KEY: Record<string, string> = {
  original: "reviewBadgeOriginal",
  concept_probe: "reviewBadgeConceptProbe",
  formula_probe: "reviewBadgeFormulaProbe",
  procedure_probe: "reviewBadgeProcedureProbe",
  calculation_probe: "reviewBadgeCalculationProbe",
  calculator_probe: "reviewBadgeCalculatorProbe",
};

const MISTAKE_ICONS: Record<MistakeReason, keyof typeof Ionicons.glyphMap> = {
  concept: "bulb-outline",
  formula: "calculator-outline",
  procedure: "git-branch-outline",
  calculation: "keypad-outline",
  calculator: "hardware-chip-outline",
  rushed: "time-outline",
};

export default function Review() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("loading");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<{ answer: string; confidence: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const attemptStartRef = useRef(Date.now());

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ items: ReviewItem[]; total_due: number }>("/review/queue");
        if (!res.items.length) { setStep("empty"); return; }
        setItems(res.items);
        attemptStartRef.current = Date.now();
        setStep("question");
      } catch {
        setStep("empty");
      }
    })();
  }, []);

  const reveal = async () => {
    Haptics.selectionAsync();
    const item = items[index];
    const secs = Math.max(1, Math.round((Date.now() - attemptStartRef.current) / 1000));
    setElapsed(secs);
    try {
      const res = await api<{ answer: string; confidence: string }>(`/review-items/${item.review_item_id}/reveal`, {
        method: "POST", body: { time_spent_seconds: secs },
      });
      setAnswer(res);
      setStep("reveal");
    } catch {}
  };

  const advance = () => {
    setAnswer(null);
    if (index + 1 >= items.length) {
      setStep("summary");
    } else {
      setIndex((i) => i + 1);
      attemptStartRef.current = Date.now();
      setStep("question");
    }
  };

  const reportCorrect = async (correct: boolean) => {
    const item = items[index];
    if (correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCorrectCount((c) => c + 1);
      try {
        await api(`/review-items/${item.review_item_id}/attempt`, { method: "POST", body: { time_spent_seconds: elapsed, correct: true } });
      } catch {}
      advance();
    } else {
      setRedoCount((c) => c + 1);
      setStep("mistake");
    }
  };

  const reportMistake = async (reason: MistakeReason) => {
    const item = items[index];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api(`/review-items/${item.review_item_id}/attempt`, {
        method: "POST", body: { time_spent_seconds: elapsed, correct: false, mistake_reason: reason },
      });
    } catch {}
    advance();
  };

  if (step === "loading") {
    return <View style={styles.centered}><PaperPlaneLoader label={t("loading")} /></View>;
  }

  if (step === "empty") {
    return (
      <View style={[styles.centered, { padding: spacing.xl }]} testID="review-empty">
        <PaperPlane size={64} />
        <RText weight="heavy" style={styles.title}>{t("reviewEmptyTitle")}</RText>
        <RText style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.sm }}>{t("reviewEmptySubtitle")}</RText>
        <PrimaryButton testID="review-empty-back" label={t("reviewBackHome")} onPress={() => router.back()} style={{ marginTop: spacing["2xl"], width: 260 }} />
      </View>
    );
  }

  if (step === "summary") {
    return (
      <View style={[styles.centered, { padding: spacing.xl }]} testID="review-summary">
        <Card style={{ alignItems: "center", paddingVertical: spacing["2xl"], width: "100%" }}>
          <PaperPlane size={72} />
          <RText weight="heavy" style={[styles.title, { marginTop: spacing.lg }]}>{t("reviewDone")}</RText>
          <RText weight="medium" style={{ color: colors.onSurfaceSecondary, marginTop: 4 }}>
            {t("reviewDoneSummary", { correct: correctCount, redo: redoCount })}
          </RText>
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { borderColor: colors.warning }]}>
              <Ionicons name="alert-circle" size={20} color={colors.warning} />
              <RText weight="heavy" style={{ color: colors.onSurface, fontSize: font.xl }}>{redoCount}</RText>
              <RText style={{ color: colors.muted, fontSize: font.sm }}>{t("reviewRedoStat")}</RText>
            </View>
            <View style={[styles.statBox, { borderColor: colors.success }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <RText weight="heavy" style={{ color: colors.onSurface, fontSize: font.xl }}>{correctCount}</RText>
              <RText style={{ color: colors.muted, fontSize: font.sm }}>{t("reviewCorrectStat")}</RText>
            </View>
          </View>
        </Card>
        <PrimaryButton testID="review-back-home" label={t("reviewBackHome")} onPress={() => router.back()} style={{ marginTop: spacing.xl, width: "100%" }} />
      </View>
    );
  }

  const item = items[index];
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="review-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <RText weight="heavy" style={styles.wordmark}>BoostBac</RText>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <Ionicons name="refresh" size={14} color={colors.onBrandPrimary} />
            <RText weight="bold" style={{ color: colors.onBrandPrimary, fontSize: font.sm }}>{t(BADGE_KEY[item.item_type] || "reviewBadgeOriginal")}</RText>
          </View>
          <RText weight="bold" style={{ color: colors.onSurfaceSecondary, fontSize: font.sm }}>
            {t("reviewQuestionProgress", { i: index + 1, n: items.length })}
          </RText>
        </View>

        <Card style={{ marginTop: spacing.md }}>
          <RText weight="medium" style={styles.qText}>{formatExerciseText(item.item_content)}</RText>
        </Card>

        {step !== "question" && answer ? (
          <View style={{ marginTop: spacing.xl }}>
            <RText weight="heavy" style={styles.title}>{t("solutionTitle")}</RText>
            <Card style={{ marginTop: spacing.sm, backgroundColor: colors.brandTertiary, borderWidth: 0 }}>
              <RText weight="medium" style={styles.aText}>{formatExerciseText(answer.answer)}</RText>
            </Card>
          </View>
        ) : null}

        {step === "mistake" ? (
          <View style={{ marginTop: spacing.xl }}>
            <View style={{ alignItems: "center", marginBottom: spacing.md }}><PaperPlane size={44} /></View>
            <RText weight="heavy" style={[styles.title, { textAlign: "center" }]}>{t("mistakeTitle")}</RText>
            <RText style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 4 }}>{t("mistakeSubtitle")}</RText>
            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              {MISTAKE_REASONS.map((r) => (
                <OptionRow
                  key={r}
                  testID={`mistake-${r}`}
                  label={t(`mistake_${r}`)}
                  selected={false}
                  onPress={() => reportMistake(r)}
                  icon={<Ionicons name={MISTAKE_ICONS[r]} size={20} color={colors.onSurfaceSecondary} />}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + spacing.md }]}>
        {step === "question" ? (
          <PrimaryButton
            testID="review-solved-it"
            label={t("studySolvedIt")}
            icon={<Ionicons name="checkmark-circle" size={20} color={colors.onBrandPrimary} />}
            onPress={reveal}
          />
        ) : step === "reveal" ? (
          <>
            <RText weight="bold" style={styles.hintText}>{t("howWasIt")}</RText>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <PrimaryButton testID="report-wrong" variant="secondary" label={t("gotItWrong")} onPress={() => reportCorrect(false)} style={{ flex: 1 }} />
              <PrimaryButton testID="report-correct" label={t("gotItRight")} onPress={() => reportCorrect(true)} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  wordmark: { color: colors.onSurface, fontSize: font.lg },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  title: { color: colors.onSurface, fontSize: font.xl },
  qText: { color: colors.onSurface, fontSize: font.lg, lineHeight: 26 },
  aText: { color: colors.onSurface, fontSize: font.base, lineHeight: 24 },
  statsRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xl },
  statBox: { alignItems: "center", gap: 4, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, borderRadius: radius.md, borderWidth: 1.5 },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  hintText: { color: colors.onSurfaceSecondary, fontSize: font.sm, textAlign: "center" },
});
