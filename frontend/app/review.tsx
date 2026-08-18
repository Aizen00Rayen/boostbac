import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
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
import { api, ApiError } from "@/src/api";
import { useI18n, randomCheer, DERJA_SESSION_DONE } from "@/src/i18n";
import { cacheQueue, getCachedQueue, isOnline, addPending, flushPending } from "@/src/offline";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, PrimaryButton } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";
import { formatExerciseText } from "@/src/utils/formatText";

type CardT = {
  card_id: string;
  deck_id?: string;
  question: string;
  answer: string;
  subject: string;
  topic: string;
  difficulty: string;
};
type Rating = "again" | "hard" | "good" | "easy";
type Attachment = { attachment_base64: string; attachment_mime: string };

const RATINGS: { key: Rating; color: string }[] = [
  { key: "again", color: colors.info },
  { key: "hard", color: colors.warning },
  { key: "good", color: colors.brand },
  { key: "easy", color: colors.success },
];

export default function Review() {
  const { t, isRTL } = useI18n();
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
  const [offline, setOffline] = useState(false);
  const [cheer, setCheer] = useState("");
  const [attachments, setAttachments] = useState<Record<string, Attachment | null>>({});

  const spin = useSharedValue(0);
  const cheerOpacity = useSharedValue(0);
  const total = queue.length;

  useEffect(() => {
    const card = queue[index];
    const deckId = card?.deck_id;
    if (!deckId || deckId in attachments) return;
    (async () => {
      try {
        const a = await api<Attachment>(`/decks/${deckId}/attachment`);
        setAttachments((prev) => ({ ...prev, [deckId]: a }));
      } catch {
        setAttachments((prev) => ({ ...prev, [deckId]: null }));
      }
    })();
  }, [index, queue, attachments]);

  useEffect(() => {
    (async () => {
      try {
        flushPending();
        const online = await isOnline();
        if (!online) throw new Error("offline");
        const q = await api<{ cards: CardT[] }>(`/review/queue${deck_id ? `?deck_id=${deck_id}` : ""}`);
        setQueue(q.cards);
        if (!deck_id) cacheQueue(q.cards as any);
        if (q.cards.length === 0) finish(0, 0, 0);
      } catch {
        // offline fallback: use cached queue
        const cached = await getCachedQueue();
        setOffline(true);
        setQueue(cached as any);
        if (cached.length === 0) finish(0, 0, 0);
      } finally {
        setLoading(false);
      }
    })();
  }, [deck_id]);

  const showCheer = (text: string) => {
    setCheer(text);
    cheerOpacity.value = withSequence(
      withTiming(1, { duration: 220 }),
      withDelay(1100, withTiming(0, { duration: 400 })),
    );
  };

  const cheerStyle = useAnimatedStyle(() => ({ opacity: cheerOpacity.value }));

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
    const LOCAL_XP: Record<Rating, number> = { again: 2, hard: 5, good: 8, easy: 10 };
    try {
      const res = await api<{ xp_earned: number }>("/review/submit", { method: "POST", body: { card_id: card.card_id, rating }, timeout: 12000 });
      gained = res.xp_earned;
      setXp((x) => x + res.xp_earned);
    } catch (e: any) {
      // offline / network → queue for later sync, credit XP locally
      if (e instanceof ApiError && (e.status === 0 || e.status === 408)) {
        setOffline(true);
        await addPending({ card_id: card.card_id, rating });
        gained = LOCAL_XP[rating];
        setXp((x) => x + gained);
      }
    }

    if (rating === "good" || rating === "easy") showCheer(randomCheer());

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
  const attachment = card.deck_id ? attachments[card.deck_id] : null;
  const attachmentUri = attachment
    ? `data:${attachment.attachment_mime};base64,${attachment.attachment_base64}`
    : null;
  const questionText = formatExerciseText(card.question);
  const answerText = formatExerciseText(card.answer);
  const isLongQuestion = questionText.length > 90;
  const isLongAnswer = answerText.length > 90;

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

      {offline && (
        <View style={styles.offlineBanner} testID="offline-banner">
          <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
          <RText weight="medium" style={{ color: colors.warning, fontSize: font.sm }}>{t("offline")}</RText>
        </View>
      )}

      <View style={styles.cardArea}>
        <Animated.View style={[styles.cheerToast, cheerStyle]} pointerEvents="none">
          <RText weight="heavy" style={styles.cheerText}>{cheer}</RText>
        </Animated.View>
        <Pressable testID="flashcard" onPress={flip} style={styles.cardPress}>
          <Animated.View style={[styles.card, styles.cardFront, frontStyle]}>
            <View style={styles.subjectTag}>
              <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{card.subject} · {card.topic}</RText>
            </View>
            {attachmentUri ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.attachmentScroll} showsVerticalScrollIndicator={false}>
                {attachment!.attachment_mime === "application/pdf" ? (
                  <WebView source={{ uri: attachmentUri }} style={styles.attachmentPdf} scalesPageToFit />
                ) : (
                  <Image source={{ uri: attachmentUri }} style={styles.attachmentImage} contentFit="contain" />
                )}
                <RText
                  weight="medium"
                  style={[styles.qText, styles.qTextWithAttachment, { textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}
                >
                  {questionText}
                </RText>
              </ScrollView>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.cardCenter} showsVerticalScrollIndicator={false}>
                <RText
                  weight={isLongQuestion ? "medium" : "bold"}
                  style={[
                    styles.qText,
                    isLongQuestion && styles.qTextLong,
                    { textAlign: isLongQuestion ? (isRTL ? "right" : "left") : "center", writingDirection: isRTL ? "rtl" : "ltr" },
                  ]}
                >
                  {questionText}
                </RText>
              </ScrollView>
            )}
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
              <RText
                weight="medium"
                style={[
                  styles.aText,
                  isLongAnswer && styles.aTextLong,
                  { textAlign: isLongAnswer ? (isRTL ? "right" : "left") : "center", writingDirection: isRTL ? "rtl" : "ltr" },
                ]}
              >
                {answerText}
              </RText>
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
      <RText weight="medium" style={styles.derjaLine}>{DERJA_SESSION_DONE}</RText>

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
  offlineBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surfaceSecondary, paddingVertical: 6, marginHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.warning },
  cheerToast: { position: "absolute", top: 8, left: 0, right: 0, alignItems: "center", zIndex: 5 },
  cheerText: { color: colors.success, fontSize: font.lg, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, overflow: "hidden" },
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
  qTextLong: { fontSize: font.lg, lineHeight: 26, alignSelf: "stretch" },
  qTextWithAttachment: { fontSize: font.base, lineHeight: 22, marginTop: spacing.md, alignSelf: "stretch" },
  aText: { color: colors.onSurfaceSecondary, fontSize: font.xl, textAlign: "center", lineHeight: 30 },
  aTextLong: { fontSize: font.lg, lineHeight: 25, alignSelf: "stretch" },
  revealHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  attachmentScroll: { alignItems: "center", paddingVertical: spacing.md },
  attachmentImage: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  attachmentPdf: { width: "100%", height: 260, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  rateLabel: { color: colors.onSurfaceSecondary, textAlign: "center", marginBottom: spacing.md },
  ratingRow: { flexDirection: "row", gap: spacing.sm },
  rateBtn: { flex: 1, height: 60, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  // summary
  flyZone: { height: 120, width: "100%", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  summaryTitle: { color: colors.onSurface, fontSize: font["2xl"], textAlign: "center" },
  derjaLine: { color: colors.brand, fontSize: font.lg, textAlign: "center", marginTop: spacing.sm },
  summaryStats: { flexDirection: "row", gap: spacing.lg, marginTop: spacing["2xl"] },
  sumItem: { alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, minWidth: 92, borderWidth: 1, borderColor: colors.border },
  sumVal: { color: colors.brand, fontSize: font["2xl"] },
  sumLabel: { color: colors.muted, fontSize: font.sm, textAlign: "center", marginTop: 4 },
  streakBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, marginTop: spacing.xl },
});
