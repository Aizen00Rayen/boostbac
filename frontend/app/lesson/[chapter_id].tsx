import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useI18n, randomCheer, DERJA_SESSION_DONE } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";
import { formatExerciseText } from "@/src/utils/formatText";
import { QuizRound } from "@/src/components/games/QuizRound";
import { FillBlankRound } from "@/src/components/games/FillBlankRound";
import { MatchingRound } from "@/src/components/games/MatchingRound";
import { GameCard } from "@/src/components/games/types";

type RoundItem = { type: "quiz" | "blank" | "match" | "flip"; cards: GameCard[] };

function buildRound(cards: GameCard[]): RoundItem[] {
  const pool = [...cards];
  const items: RoundItem[] = [];

  const matchable = pool.filter((c) => c.game_data?.match_prompt && c.game_data?.match_answer);
  if (matchable.length >= 3) {
    const chosen = matchable.slice(0, 4);
    items.push({ type: "match", cards: chosen });
    chosen.forEach((c) => {
      const idx = pool.findIndex((p) => p.card_id === c.card_id);
      if (idx >= 0) pool.splice(idx, 1);
    });
  }

  for (const c of pool) {
    if (c.game_data?.quiz_options && c.game_data.quiz_options.length === 4) {
      items.push({ type: "quiz", cards: [c] });
    } else if (c.game_data?.blank_sentence) {
      items.push({ type: "blank", cards: [c] });
    } else {
      items.push({ type: "flip", cards: [c] });
    }
  }
  return items;
}

function FlipItem({ card, onAnswer }: { card: GameCard; onAnswer: (correct: boolean) => void }) {
  const { t, isRTL } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const dirStyle = { textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" } as const;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.itemContainer} showsVerticalScrollIndicator={false}>
      <RText weight="medium" style={[styles.question, dirStyle]}>{formatExerciseText(card.question)}</RText>
      {revealed && (
        <View style={styles.answerBox}>
          <RText weight="medium" style={[styles.answerText, dirStyle]}>{formatExerciseText(card.answer)}</RText>
        </View>
      )}
      {!revealed ? (
        <PrimaryButton testID="flip-reveal" label={t("showAnswer")} onPress={() => setRevealed(true)} style={{ marginTop: spacing.xl }} />
      ) : (
        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
          <PrimaryButton
            testID="flip-missed"
            variant="secondary"
            label={t("missedIt")}
            onPress={() => onAnswer(false)}
            style={{ flex: 1 }}
            icon={<Ionicons name="close" size={18} color={colors.error} />}
          />
          <PrimaryButton
            testID="flip-got"
            label={t("gotIt")}
            onPress={() => onAnswer(true)}
            style={{ flex: 1 }}
            icon={<Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} />}
          />
        </View>
      )}
    </ScrollView>
  );
}

export default function Lesson() {
  const { chapter_id, name } = useLocalSearchParams<{ chapter_id: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const [items, setItems] = useState<RoundItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [xp, setXp] = useState(0);
  const [done, setDone] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ cards: GameCard[] }>(`/path/chapters/${chapter_id}/cards?limit=8`);
        const round = buildRound(res.cards);
        if (round.length === 0) { setError(true); return; }
        setItems(round);
      } catch {
        setError(true);
      }
    })();
  }, [chapter_id]);

  const submitCard = async (card_id: string, correct: boolean) => {
    try {
      const res = await api<{ xp_earned: number }>("/review/submit", {
        method: "POST",
        body: { card_id, rating: correct ? "good" : "again" },
      });
      setXp((x) => x + res.xp_earned);
    } catch {
      // best-effort — lesson progress continues even if scoring sync fails
    }
  };

  const handleResults = async (results: Record<string, boolean>) => {
    const ids = Object.keys(results);
    const correctIds = ids.filter((id) => results[id]);
    setTotalAnswered((n) => n + ids.length);
    setCorrectCount((n) => n + correctIds.length);
    if (correctIds.length > 0) {
      setCheer(randomCheer());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCheer(null), 1400);
    }
    await Promise.allSettled(ids.map((id) => submitCard(id, results[id])));
    if (index + 1 >= (items?.length || 0)) setDone(true);
    else setIndex((i) => i + 1);
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <PaperPlane size={40} color={colors.muted} />
        <RText weight="bold" style={{ color: colors.onSurface, marginTop: spacing.lg }}>{t("chapterLocked")}</RText>
        <PrimaryButton testID="lesson-back" label={t("back")} onPress={() => router.back()} style={{ marginTop: spacing.xl, width: 200 }} />
      </View>
    );
  }

  if (!items) {
    return (
      <View style={styles.centered}>
        <PaperPlaneLoader label={t("loading")} />
      </View>
    );
  }

  if (done) {
    const acc = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    return (
      <View style={[styles.centered, { padding: spacing.xl }]} testID="lesson-summary">
        <PaperPlane size={48} color={colors.brand} />
        <RText weight="heavy" style={styles.summaryTitle}>{t("lessonComplete")}</RText>
        <RText weight="medium" style={{ color: colors.brand, marginTop: spacing.sm }}>{DERJA_SESSION_DONE}</RText>
        <View style={styles.summaryStats}>
          <View style={styles.sumItem}>
            <RText weight="heavy" style={styles.sumVal}>{acc}%</RText>
            <RText style={styles.sumLabel}>{t("accuracy")}</RText>
          </View>
          <View style={styles.sumItem}>
            <RText weight="heavy" style={[styles.sumVal, { color: colors.warning }]}>+{xp}</RText>
            <RText style={styles.sumLabel}>{t("xpEarned")}</RText>
          </View>
        </View>
        <PrimaryButton testID="lesson-continue" label={t("continuePath")} onPress={() => router.back()} style={{ width: 260, marginTop: spacing["2xl"] }} />
      </View>
    );
  }

  const item = items[index];
  const progress = items.length > 0 ? index / items.length : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="lesson-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.onSurfaceSecondary} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.xpChip}>
          <Ionicons name="flash" size={14} color={colors.warning} />
          <RText weight="heavy" style={{ color: colors.onSurface, fontSize: font.sm }}>{xp}</RText>
        </View>
      </View>
      {name ? (
        <RText weight="bold" style={styles.chapterTitle} numberOfLines={1}>{name}</RText>
      ) : null}

      {cheer && (
        <View style={styles.cheerToast} pointerEvents="none">
          <RText weight="heavy" style={styles.cheerText}>{cheer}</RText>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {item.type === "quiz" && <QuizRound key={item.cards[0].card_id} card={item.cards[0]} onAnswer={(c) => handleResults({ [item.cards[0].card_id]: c })} />}
        {item.type === "blank" && <FillBlankRound key={item.cards[0].card_id} card={item.cards[0]} onAnswer={(c) => handleResults({ [item.cards[0].card_id]: c })} />}
        {item.type === "flip" && <FlipItem key={item.cards[0].card_id} card={item.cards[0]} onAnswer={(c) => handleResults({ [item.cards[0].card_id]: c })} />}
        {item.type === "match" && <MatchingRound key={item.cards.map((c) => c.card_id).join(",")} cards={item.cards} onComplete={handleResults} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  progressTrack: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brand, borderRadius: radius.pill },
  xpChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  chapterTitle: { color: colors.onSurfaceSecondary, fontSize: font.base, textAlign: "center", paddingHorizontal: spacing.lg, marginTop: 4 },
  cheerToast: { position: "absolute", top: 60, left: 0, right: 0, alignItems: "center", zIndex: 5 },
  cheerText: { color: colors.success, fontSize: font.lg, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, overflow: "hidden" },
  itemContainer: { padding: spacing.lg, flexGrow: 1, justifyContent: "flex-start" },
  question: { color: colors.onSurface, fontSize: font.lg, lineHeight: 24 },
  answerBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.xl },
  answerText: { color: colors.onSurfaceSecondary, fontSize: font.base, lineHeight: 22 },
  summaryTitle: { color: colors.onSurface, fontSize: font["2xl"], textAlign: "center", marginTop: spacing.lg },
  summaryStats: { flexDirection: "row", gap: spacing.lg, marginTop: spacing["2xl"] },
  sumItem: { alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, minWidth: 92 },
  sumVal: { color: colors.brand, fontSize: font["2xl"] },
  sumLabel: { color: colors.muted, fontSize: font.sm, textAlign: "center", marginTop: 4 },
});
