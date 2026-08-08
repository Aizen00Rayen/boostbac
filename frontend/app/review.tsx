import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, PrimaryButton } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";

type CardT = { card_id: string; question: string; answer: string; subject: string; topic: string; difficulty: string };
type Rating = "again" | "hard" | "good" | "easy";

const RATINGS: { key: Rating; color: string }[] = [
  { key: "again", color: colors.info },
  { key: "hard", color: colors.warning },
  { key: "good", color: colors.brand },
  { key: "easy", color: colors.success },
];

export default function Review() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deck_id } = useLocalSearchParams<{ deck_id?: string }>();

  const [queue, setQueue] = useState<CardT[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [xp, setXp] = useState(0);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<{ bonus_xp: number; total_xp: number; current_streak: number } | null>(null);

  const spin = useSharedValue(0);
  const total = queue.length;

  useEffect(() => {
    (async () => {
      try {
        const q = await api<{ cards: CardT[] }>(`/review/queue${deck_id ? `?deck_id=${deck_id}` : ""}`);
        setQueue(q.cards);
        if (q.cards.length === 0) finish(0, 0, 0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [deck_id]);

  const flip = () => {
    Haptics.selectionAsync();
    const next = !flipped;
    setFlipped(next);
    spin.value = withTiming(next ? 1 : 0, { duration: 420, easing: Easing.inOut(Easing.ease) });
  };

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(spin.value, [0, 1], [0, 180])}deg` }],
    opacity: spin.value < 0.5 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${interpolate(spin.value, [0, 1], [180, 360])}deg` }],
    opacity: spin.value >= 0.5 ? 1 : 0,
  }));

  const finish = useCallback(async (rev: number, cor: number, gainedXp: number) => {
    try {
      const s = await api<{ bonus_xp: number; total_xp: number; current_streak: number }>("/review/complete", {
        method: "POST",
        body: { reviewed: rev, correct: cor, xp_earned: gainedXp },
      });
      setSummary(s);
    } catch {
      setSummary({ bonus_xp: 0, total_xp: gainedXp, current_streak: 0 });
    }
    setDone(true);
  }, []);

  const rate = async (rating: Rating) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const card = queue[index];
    const newReviewed = reviewed + 1;
    const newCorrect = correct + (rating === "again" || rating === "hard" ? 0 : 1);
    setReviewed(newReviewed);
    setCorrect(newCorrect);

    let gained = 0;
    try {
      const res = await api<{ xp_earned: number }>("/review/submit", { method: "POST", body: { card_id: card.card_id, rating } });
      gained = res.xp_earned;
      setXp((x) => x + res.xp_earned);
    } catch {}

    // build next queue: if "again", re-append card
    let nextQueue = queue;
    if (rating === "again") {
      nextQueue = [...queue, card];
      setQueue(nextQueue);
    }

    // reset flip then advance
    spin.value = withTiming(0, { duration: 180 });
    setFlipped(false);

    if (index + 1 >= nextQueue.length) {
      finish(newReviewed, newCorrect, xp + gained);
    } else {
      setIndex(index + 1);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperPlaneLoader label={t("loading")} />
      </View>
    );
  }

  if (done) {
    return <Summary reviewed={reviewed} correct={correct} xp={xp} summary={summary} onClose={() => router.back()} />;
  }

  const card = queue[index];
  const progress = total > 0 ? (index) / total : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="review-close" onPress={() => router.back()} style={styles.iconBtn}>
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

      <View style={styles.cardArea}>
        <Pressable testID="flashcard" onPress={flip} style={styles.cardPress}>
          <Animated.View style={[styles.card, styles.cardFront, frontStyle]}>
            <View style={styles.subjectTag}>
              <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{card.subject} · {card.topic}</RText>
            </View>
            <View style={styles.cardCenter}>
              <RText weight="bold" style={styles.qText}>{card.question}</RText>
            </View>
            <View style={styles.revealHint}>
              <Ionicons name="sync" size={16} color={colors.muted} />
              <RText style={{ color: colors.muted, fontSize: font.sm }}>{t("tapToReveal")}</RText>
            </View>
          </Animated.View>

          <Animated.View style={[styles.card, styles.cardBack, backStyle]}>
            <View style={styles.subjectTag}>
              <RText weight="bold" style={{ color: colors.onBrandPrimary, fontSize: font.sm }}>{t("answer")}</RText>
            </View>
            <ScrollView contentContainerStyle={styles.cardCenter} showsVerticalScrollIndicator={false}>
              <RText weight="medium" style={styles.aText}>{card.answer}</RText>
            </ScrollView>
          </Animated.View>
        </Pressable>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {!flipped ? (
          <PrimaryButton testID="reveal-answer" label={t("showAnswer")} onPress={flip} />
        ) : (
          <View>
            <RText weight="bold" style={styles.rateLabel}>{t("rateRecall")}</RText>
            <View style={styles.ratingRow}>
              {RATINGS.map((r) => (
                <Pressable
                  key={r.key}
                  testID={`rate-${r.key}`}
                  onPress={() => rate(r.key)}
                  style={({ pressed }) => [
                    styles.rateBtn,
                    { borderColor: r.key === "good" ? colors.brand : colors.border },
                    r.key === "good" && glow(colors.brand, 8),
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                >
                  <RText weight="heavy" style={{ color: r.color, fontSize: font.base }}>{t(r.key)}</RText>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function Summary({
  reviewed,
  correct,
  xp,
  summary,
  onClose,
}: {
  reviewed: number;
  correct: number;
  xp: number;
  summary: { bonus_xp: number; total_xp: number; current_streak: number } | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const fly = useSharedValue(0);
  const acc = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    fly.value = withSequence(
      withTiming(0, { duration: 100 }),
      withDelay(200, withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) })),
    );
  }, []);

  const planeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(fly.value, [0, 1], [-140, 160]) },
      { translateY: interpolate(fly.value, [0, 0.5, 1], [40, -60, -160]) },
      { rotate: `${interpolate(fly.value, [0, 1], [-10, 20])}deg` },
      { scale: interpolate(fly.value, [0, 1], [1, 0.5]) },
    ],
    opacity: interpolate(fly.value, [0, 0.8, 1], [1, 1, 0]),
  }));

  return (
    <View style={[styles.container, { alignItems: "center", justifyContent: "center", padding: spacing.xl }]} testID="review-summary">
      <View style={styles.flyZone} pointerEvents="none">
        <Animated.View style={planeStyle}>
          <PaperPlane size={54} color={colors.brand} />
        </Animated.View>
      </View>
      <RText weight="heavy" style={styles.summaryTitle}>{t("sessionComplete")}</RText>

      <View style={styles.summaryStats}>
        <View style={styles.sumItem}>
          <RText weight="heavy" style={styles.sumVal}>{reviewed}</RText>
          <RText style={styles.sumLabel}>{t("cardsReviewed")}</RText>
        </View>
        <View style={styles.sumItem}>
          <RText weight="heavy" style={[styles.sumVal, { color: colors.success }]}>{acc}%</RText>
          <RText style={styles.sumLabel}>{t("accuracy")}</RText>
        </View>
        <View style={styles.sumItem}>
          <RText weight="heavy" style={[styles.sumVal, { color: colors.warning }]}>+{xp + (summary?.bonus_xp || 0)}</RText>
          <RText style={styles.sumLabel}>{t("xpEarned")}</RText>
        </View>
      </View>

      <View style={styles.streakBanner}>
        <PaperPlane size={20} color={colors.brand} />
        <RText weight="bold" style={{ color: colors.onSurface }}>
          {summary?.current_streak ?? 0} {t("streak")}
        </RText>
      </View>

      <PrimaryButton testID="summary-back" label={t("backHome")} onPress={onClose} style={{ width: 260, marginTop: spacing["2xl"] }} />
    </View>
  );
}

const CARD_H = 400;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  progressTrack: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brand, borderRadius: radius.pill },
  xpChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  cardArea: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: "center" },
  cardPress: { height: CARD_H },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    padding: spacing.xl,
    backfaceVisibility: "hidden",
    borderWidth: 1,
  },
  cardFront: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
  cardBack: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  subjectTag: { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  cardCenter: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.lg },
  qText: { color: colors.onSurface, fontSize: font["2xl"], textAlign: "center", lineHeight: 34 },
  aText: { color: colors.onSurfaceSecondary, fontSize: font.xl, textAlign: "center", lineHeight: 30 },
  revealHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  rateLabel: { color: colors.onSurfaceSecondary, textAlign: "center", marginBottom: spacing.md },
  ratingRow: { flexDirection: "row", gap: spacing.sm },
  rateBtn: { flex: 1, height: 60, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  // summary
  flyZone: { height: 120, width: "100%", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  summaryTitle: { color: colors.onSurface, fontSize: font["2xl"], textAlign: "center" },
  summaryStats: { flexDirection: "row", gap: spacing.lg, marginTop: spacing["2xl"] },
  sumItem: { alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, minWidth: 92, borderWidth: 1, borderColor: colors.border },
  sumVal: { color: colors.brand, fontSize: font["2xl"] },
  sumLabel: { color: colors.muted, fontSize: font.sm, textAlign: "center", marginTop: 4 },
  streakBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, marginTop: spacing.xl },
});
