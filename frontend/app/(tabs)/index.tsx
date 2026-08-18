import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { flushPending } from "@/src/offline";
import { useBadges } from "@/src/context/BadgeContext";
import { useI18n } from "@/src/i18n";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, PrimaryButton, Card } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader, ProgressRing } from "@/src/components/graphics";

type Deck = { deck_id: string; deck_name: string; subject: string; topic: string; total_cards: number; due_cards: number };
type Home = {
  total_due: number;
  cards_reviewed_today: number;
  daily_goal: number;
  xp: number;
  current_streak: number;
  mastered_cards: number;
  total_cards: number;
  exam_date?: string | null;
  days_to_exam?: number | null;
  suggested_pace?: number | null;
  decks: Deck[];
};
type PathChapter = { chapter_id: string; name: string; total_cards: number; due_cards: number; mastered_cards: number };
type PathSummary = { subject: string; chapters: PathChapter[] };

const TRACKED_SUBJECTS = ["mathematiques", "physique", "svt"];

export default function HomeScreen() {
  const { t, isRTL } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh: refreshBadges } = useBadges();
  const [data, setData] = useState<Home | null>(null);
  const [paths, setPaths] = useState<PathSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      flushPending(); // sync any offline reviews
      const d = await api<Home>("/home");
      setData(d);
      refreshBadges();
      const results = await Promise.allSettled(
        TRACKED_SUBJECTS.map((s) => api<PathSummary>(`/path/${s}`)),
      );
      setPaths(results.filter((r): r is PromiseFulfilledResult<PathSummary> => r.status === "fulfilled").map((r) => r.value));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperPlaneLoader label={t("loading")} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
        <RText style={{ color: colors.onSurfaceSecondary, marginVertical: spacing.lg }}>{t("retry")}</RText>
        <PrimaryButton testID="home-retry" label={t("retry")} variant="secondary" onPress={load} style={{ width: 200 }} />
      </View>
    );
  }

  const d = data!;
  const goalProgress = d.daily_goal > 0 ? d.cards_reviewed_today / d.daily_goal : 0;

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerBrand}>
            <Image source={require("../../assets/images/boostbac.png")} style={styles.headerLogo} contentFit="contain" />
            <RText weight="heavy" style={styles.headerWordmark}>BoostBac</RText>
          </View>
          <View style={styles.statsRow}>
            <Pressable testID="open-leaderboard" onPress={() => router.push("/leaderboard")} style={styles.statPill}>
              <Ionicons name="trophy" size={15} color={colors.brand} />
            </Pressable>
            <View style={[styles.statPill, glow(colors.brand, 6)]} testID="streak-pill">
              <PaperPlane size={16} color={d.current_streak > 0 ? colors.brand : colors.muted} />
              <RText weight="heavy" style={styles.statPillText}>
                {d.current_streak}
              </RText>
            </View>
            <View style={styles.statPill} testID="xp-pill">
              <Ionicons name="flash" size={15} color={colors.warning} />
              <RText weight="heavy" style={styles.statPillText}>
                {d.xp}
              </RText>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {/* Today review hero */}
        <Card style={styles.heroCard}>
          <LinearGradient colors={[colors.brandTertiary, colors.surfaceSecondary]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <RText weight="bold" style={styles.heroLabel}>
                {t("todayReview")}
              </RText>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 4 }}>
                <RText weight="heavy" style={styles.heroBig} testID="due-count">
                  {d.total_due}
                </RText>
                <RText weight="medium" style={styles.heroSub}>
                  {t("cardsDue")}
                </RText>
              </View>
            </View>
            <ProgressRing progress={goalProgress} size={78} stroke={8}>
              <RText weight="heavy" style={{ fontSize: font.base, color: colors.brand }}>
                {d.cards_reviewed_today}/{d.daily_goal}
              </RText>
            </ProgressRing>
          </View>
          <View style={{ marginTop: spacing.lg }}>
            {d.total_due > 0 ? (
              <PrimaryButton testID="start-review" label={`${t("startReview")} (${d.total_due})`} onPress={() => router.push("/review")} />
            ) : (
              <View style={styles.clearBox}>
                <PaperPlane size={20} color={colors.success} />
                <RText weight="bold" style={{ color: colors.success }}>
                  {t("queueClear")}
                </RText>
              </View>
            )}
          </View>
        </Card>

        {/* Exam countdown */}
        {d.exam_date && d.days_to_exam != null ? (
          <Card style={styles.countdownCard} testID="exam-countdown">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={styles.countIcon}>
                <Ionicons name="calendar" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                {d.days_to_exam > 0 ? (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
                      <RText weight="heavy" style={{ color: colors.brand, fontSize: font["2xl"] }}>{d.days_to_exam}</RText>
                      <RText weight="bold" style={{ color: colors.onSurfaceSecondary, marginBottom: 3 }}>{t("daysToExam")}</RText>
                    </View>
                    {d.suggested_pace ? (
                      <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 2 }}>
                        {t("pacePrefix")} {d.suggested_pace} {t("paceSuffix")}
                      </RText>
                    ) : null}
                  </>
                ) : (
                  <RText weight="bold" style={{ color: colors.brand }}>{t("examToday")}</RText>
                )}
              </View>
            </View>
          </Card>
        ) : (
          <Pressable testID="set-exam-date" onPress={() => router.push("/(tabs)/profile")} style={styles.setExamRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.brand} />
            <RText weight="bold" style={{ color: colors.brand }}>{t("setExamDate")}</RText>
          </Pressable>
        )}

        {/* Learning paths (tracked subjects only) */}
        {paths.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <RText weight="heavy" style={styles.sectionTitle}>{t("yourPaths")}</RText>
            </View>
            <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
              {paths.map((p) => {
                const started = p.chapters.filter((c) => c.total_cards > 0).length;
                const totalDue = p.chapters.reduce((s, c) => s + c.due_cards, 0);
                return (
                  <Pressable
                    key={p.subject}
                    testID={`path-card-${p.subject}`}
                    onPress={() => router.push({ pathname: "/path/[subject]", params: { subject: p.subject } })}
                    style={({ pressed }) => [styles.pathRow, pressed && { transform: [{ scale: 0.99 }] }]}
                  >
                    <View style={styles.pathIcon}>
                      <Ionicons name="map" size={22} color={colors.onBrandPrimary} />
                    </View>
                    <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                      <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg }}>
                        {t(`subject_${p.subject}`)}
                      </RText>
                      <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 2 }}>
                        {started}/{p.chapters.length}
                      </RText>
                    </View>
                    {totalDue > 0 ? (
                      <View style={styles.dueBadge}>
                        <RText weight="heavy" style={{ color: colors.onBrandPrimary, fontSize: font.sm }}>{totalDue}</RText>
                      </View>
                    ) : (
                      <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color={colors.muted} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Decks path */}
        <View style={styles.sectionHead}>
          <RText weight="heavy" style={styles.sectionTitle}>
            {t("yourDecks")}
          </RText>
          <RText weight="medium" style={{ color: colors.muted }}>
            {d.mastered_cards} {t("mastered")}
          </RText>
        </View>

        {d.decks.length === 0 ? (
          <Card style={styles.emptyCard}>
            <PaperPlane size={40} color={colors.brand} />
            <RText weight="bold" style={{ color: colors.onSurface, marginTop: spacing.md, fontSize: font.lg }}>
              {t("noDecks")}
            </RText>
            <RText style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 4 }}>
              {t("queueClearSub")}
            </RText>
          </Card>
        ) : (
          <View style={{ gap: spacing.md }}>
            {d.decks.map((deck, i) => (
              <Pressable
                key={deck.deck_id}
                testID={`deck-${i}`}
                onPress={() => deck.due_cards > 0 && router.push({ pathname: "/review", params: { deck_id: deck.deck_id } })}
                style={({ pressed }) => [styles.deckRow, pressed && { transform: [{ scale: 0.99 }] }]}
              >
                <View style={[styles.deckNode, deck.due_cards > 0 && glow(colors.brand, 8), deck.due_cards === 0 && { backgroundColor: colors.surfaceTertiary }]}>
                  <Ionicons name={deck.due_cards > 0 ? "documents" : "checkmark-done"} size={22} color={deck.due_cards > 0 ? colors.onBrandPrimary : colors.success} />
                </View>
                <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                  <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg }} numberOfLines={1}>
                    {deck.deck_name}
                  </RText>
                  <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 2 }}>
                    {deck.total_cards} · {deck.subject}
                  </RText>
                </View>
                {deck.due_cards > 0 ? (
                  <View style={styles.dueBadge}>
                    <RText weight="heavy" style={{ color: colors.onBrandPrimary, fontSize: font.sm }}>
                      {deck.due_cards}
                    </RText>
                  </View>
                ) : (
                  <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color={colors.muted} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating scan CTA */}
      <View style={[styles.fabWrap, { bottom: insets.bottom + 78 }]} pointerEvents="box-none">
        <Pressable testID="scan-cta" onPress={() => router.push("/scan")} style={({ pressed }) => [styles.fab, glow(colors.brand, 16), pressed && { transform: [{ scale: 0.97 }] }]}>
          <Ionicons name="scan" size={22} color={colors.onBrandPrimary} />
          <RText weight="heavy" style={{ color: colors.onBrandPrimary, fontSize: font.lg }}>
            {t("scanGenerate")}
          </RText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  header: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerLogo: { width: 30, height: 34 },
  headerWordmark: { color: colors.onSurface, fontSize: font.lg },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  statPillText: { color: colors.onSurface, fontSize: font.base },
  heroCard: { padding: spacing.lg, overflow: "hidden" },
  heroLabel: { color: colors.onSurfaceSecondary, fontSize: font.lg },
  heroBig: { color: colors.brand, fontSize: 52, lineHeight: 56 },
  heroSub: { color: colors.onSurfaceSecondary, fontSize: font.base, marginBottom: 10 },
  clearBox: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brandTertiary, borderRadius: radius.md, paddingVertical: spacing.lg },
  countdownCard: { marginTop: spacing.md },
  countIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  setExamRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { color: colors.onSurface, fontSize: font.xl },
  emptyCard: { alignItems: "center", paddingVertical: spacing["2xl"] },
  deckRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  pathRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  pathIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  deckNode: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  dueBadge: { minWidth: 30, height: 30, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  fabWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  fab: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderRadius: radius.pill },
});
