import { useCallback, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { useI18n, Lang } from "@/src/i18n";
import { useAuth } from "@/src/context/AuthContext";
import { useBadges } from "@/src/context/BadgeContext";
import { getReminderEnabled, getReminderHour, enableReminder, disableReminder } from "@/src/notifications";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, Card, PrimaryButton } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

const STREAMS = ["math", "science", "tech", "management", "letters", "languages"] as const;
const GOALS = [10, 20, 30, 50];
const HOURS = [8, 12, 16, 18, 20, 21];

export default function Profile() {
  const { t, lang, setLang } = useI18n();
  const { user, logout, setUser, refresh } = useAuth();
  const { refresh: refreshBadges } = useBadges();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const shotRef = useRef<ViewShot>(null);
  const [home, setHome] = useState<{ mastered_cards: number; longest_streak: number; current_streak: number } | null>(null);
  const [badges, setBadges] = useState<{ id: string; icon: string; earned: boolean; progress: number; value: number; target: number }[]>([]);
  const [earnedCount, setEarnedCount] = useState(0);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderHour, setReminderHour] = useState(18);
  const [notifMsg, setNotifMsg] = useState("");
  const [showDate, setShowDate] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, me, b] = await Promise.all([api<any>("/home"), api<any>("/auth/me"), api<any>("/badges")]);
      setHome({ mastered_cards: h.mastered_cards, longest_streak: h.longest_streak, current_streak: h.current_streak });
      setUser(me);
      setBadges(b.badges);
      setEarnedCount(b.earned_count);
      setReminderOn(await getReminderEnabled());
      setReminderHour(await getReminderHour());
      refreshBadges();
    } catch {}
  }, [setUser, refreshBadges]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const updateProfile = async (patch: any) => {
    try {
      const u = await api<any>("/profile", { method: "PUT", body: patch });
      setUser(u);
    } catch {}
  };

  const onLogout = async () => {
    await logout();
    router.replace("/welcome");
  };

  const toggleReminder = async () => {
    setNotifMsg("");
    if (reminderOn) {
      await disableReminder();
      setReminderOn(false);
    } else {
      const ok = await enableReminder(t("notifTitle"), t("notifBody"), reminderHour);
      if (ok) setReminderOn(true);
      else setNotifMsg(t("notifDenied"));
    }
  };

  const pickHour = async (h: number) => {
    setReminderHour(h);
    if (reminderOn) await enableReminder(t("notifTitle"), t("notifBody"), h);
  };

  const onShare = async () => {
    try {
      if (Platform.OS === "web") return;
      const uri = await shotRef.current?.capture?.();
      if (!uri) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: t("shareProgress"), mimeType: "image/png" });
      }
    } catch {}
  };

  if (!user) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <RText weight="heavy" style={styles.headerTitle}>
          {t("profile")}
        </RText>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
        {/* Identity — shareable card */}
        <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={{ borderRadius: radius.lg, overflow: "hidden" }}>
          <View style={styles.shareCard}>
            <LinearGradient colors={["#0F3B45", colors.surface]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.lg }}>
              <PaperPlane size={20} color={colors.brand} />
              <RText weight="heavy" style={{ color: colors.brand, fontSize: font.lg, letterSpacing: 1 }}>BOOSTBAC</RText>
            </View>
            <View style={[styles.avatar, glow(colors.brand, 12)]}>
              {user.picture ? (
                <Image source={{ uri: user.picture }} style={{ width: 72, height: 72, borderRadius: 36 }} />
              ) : (
                <RText weight="heavy" style={{ color: colors.onBrandPrimary, fontSize: font["2xl"] }}>
                  {(user.name || "?").charAt(0).toUpperCase()}
                </RText>
              )}
            </View>
            <RText weight="heavy" style={{ color: colors.onSurface, fontSize: font.xl, marginTop: spacing.md }}>
              {user.name}
            </RText>
            <RText style={{ color: colors.muted }}>{user.email || t("member")}</RText>
            <View style={styles.shareStats}>
              <View style={styles.shareStat}>
                <RText weight="heavy" style={{ color: colors.brand, fontSize: font.xl }}>{home?.current_streak ?? 0}</RText>
                <RText style={styles.gridLabel}>{t("streak")}</RText>
              </View>
              <View style={styles.shareStat}>
                <RText weight="heavy" style={{ color: colors.warning, fontSize: font.xl }}>{user.xp}</RText>
                <RText style={styles.gridLabel}>{t("totalXP")}</RText>
              </View>
              <View style={styles.shareStat}>
                <RText weight="heavy" style={{ color: colors.success, fontSize: font.xl }}>{earnedCount}</RText>
                <RText style={styles.gridLabel}>{t("badges")}</RText>
              </View>
            </View>
          </View>
        </ViewShot>

        {Platform.OS !== "web" && (
          <PrimaryButton
            testID="share-progress"
            variant="secondary"
            label={t("shareProgress")}
            onPress={onShare}
            icon={<Ionicons name="share-social" size={20} color={colors.brand} />}
            style={{ marginTop: spacing.md }}
          />
        )}

        {/* Stats grid */}
        <View style={styles.grid}>
          <Card style={styles.gridItem}>
            <Ionicons name="flash" size={22} color={colors.warning} />
            <RText weight="heavy" style={styles.gridVal}>{user.xp}</RText>
            <RText style={styles.gridLabel}>{t("totalXP")}</RText>
          </Card>
          <Card style={styles.gridItem}>
            <PaperPlane size={22} color={colors.brand} />
            <RText weight="heavy" style={styles.gridVal}>{home?.current_streak ?? 0}</RText>
            <RText style={styles.gridLabel}>{t("streak")}</RText>
          </Card>
          <Card style={styles.gridItem}>
            <Ionicons name="ribbon" size={22} color={colors.success} />
            <RText weight="heavy" style={styles.gridVal}>{home?.mastered_cards ?? 0}</RText>
            <RText style={styles.gridLabel}>{t("cardsMastered")}</RText>
          </Card>
          <Card style={styles.gridItem}>
            <Ionicons name="trophy" size={22} color={colors.brand} />
            <RText weight="heavy" style={styles.gridVal}>{home?.longest_streak ?? 0}</RText>
            <RText style={styles.gridLabel}>{t("longestStreak")}</RText>
          </Card>
        </View>

        {/* Badges */}
        <View style={styles.badgeHead}>
          <RText weight="bold" style={styles.sectionLabel}>{t("badges")}</RText>
          <RText weight="heavy" style={{ color: colors.brand }}>{earnedCount}/{badges.length}</RText>
        </View>
        <View style={styles.badgeGrid}>
          {badges.map((b) => (
            <View key={b.id} style={[styles.badge, b.earned && styles.badgeEarned]} testID={`badge-${b.id}`}>
              <View style={[styles.badgeIcon, b.earned && glow(colors.brand, 8), !b.earned && { backgroundColor: colors.surfaceTertiary }]}>
                <Ionicons name={b.icon as any} size={22} color={b.earned ? colors.onBrandPrimary : colors.muted} />
              </View>
              <RText weight="bold" style={{ color: b.earned ? colors.onSurface : colors.muted, fontSize: font.sm, textAlign: "center", marginTop: 6 }} numberOfLines={2}>
                {t(`badge_${b.id}`)}
              </RText>
              {!b.earned && (
                <View style={styles.badgeProgTrack}>
                  <View style={[styles.badgeProgFill, { width: `${b.progress * 100}%` }]} />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Target stream */}
        <RText weight="bold" style={styles.sectionLabel}>{t("targetStream")}</RText>
        <View style={styles.chipWrap}>
          {STREAMS.map((s) => (
            <Pressable key={s} testID={`profile-stream-${s}`} onPress={() => updateProfile({ stream: s })} style={[styles.chip, user.stream === s && styles.chipActive]}>
              <RText weight="medium" style={{ color: user.stream === s ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontSize: font.base }}>
                {t(`stream_${s}`)}
              </RText>
            </Pressable>
          ))}
        </View>

        {/* Daily goal */}
        <RText weight="bold" style={styles.sectionLabel}>{t("editGoal")}</RText>
        <View style={styles.chipWrap}>
          {GOALS.map((g) => (
            <Pressable key={g} testID={`profile-goal-${g}`} onPress={() => updateProfile({ daily_goal: g })} style={[styles.chip, user.daily_goal === g && styles.chipActive]}>
              <RText weight="heavy" style={{ color: user.daily_goal === g ? colors.onBrandPrimary : colors.onSurfaceSecondary }}>
                {g}
              </RText>
            </Pressable>
          ))}
        </View>

        {/* Language */}
        <RText weight="bold" style={styles.sectionLabel}>{t("language")}</RText>
        <View style={styles.chipWrap}>
          {(["ar", "fr"] as Lang[]).map((l) => (
            <Pressable key={l} testID={`profile-lang-${l}`} onPress={() => { setLang(l); updateProfile({ language: l }); }} style={[styles.chip, lang === l && styles.chipActive]}>
              <RText weight="bold" style={{ color: lang === l ? colors.onBrandPrimary : colors.onSurfaceSecondary }}>
                {l === "ar" ? "العربية" : "Français"}
              </RText>
            </Pressable>
          ))}
        </View>

        {/* Exam date */}
        <RText weight="bold" style={styles.sectionLabel}>{t("examDate")}</RText>
        {Platform.OS === "web" ? (
          <Field
            testID="exam-date-input"
            placeholder="YYYY-MM-DD"
            defaultValue={user.exam_date || ""}
            onEndEditing={(e) => {
              const v = e.nativeEvent.text.trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(v)) updateProfile({ exam_date: v });
            }}
          />
        ) : (
          <Pressable testID="exam-date-btn" onPress={() => setShowDate(true)} style={styles.reminderRow}>
            <Ionicons name="calendar" size={20} color={colors.brand} />
            <RText weight="bold" style={{ color: user.exam_date ? colors.onSurface : colors.muted, marginHorizontal: spacing.md, flex: 1 }}>
              {user.exam_date ? new Date(user.exam_date).toLocaleDateString() : t("setExamDate")}
            </RText>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        )}
        {showDate && Platform.OS !== "web" && (
          <DateTimePicker
            value={user.exam_date ? new Date(user.exam_date) : new Date()}
            mode="date"
            onChange={(_e, date) => {
              setShowDate(Platform.OS === "ios");
              if (date) updateProfile({ exam_date: date.toISOString().slice(0, 10) });
            }}
          />
        )}

        {/* Reminders */}
        <RText weight="bold" style={styles.sectionLabel}>{t("reminders")}</RText>
        <Pressable testID="reminder-toggle" onPress={toggleReminder} style={styles.reminderRow}>
          <View style={{ flex: 1 }}>
            <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg }}>{t("reminders")}</RText>
            <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 2 }}>{t("remindersSub")}</RText>
          </View>
          <View style={[styles.switch, reminderOn && styles.switchOn]}>
            <View style={[styles.knob, reminderOn && styles.knobOn]} />
          </View>
        </Pressable>
        {reminderOn && (
          <View style={{ marginTop: spacing.md }}>
            <RText weight="bold" style={{ color: colors.onSurfaceSecondary, marginBottom: spacing.sm }}>{t("reminderTime")}</RText>
            <View style={styles.chipWrap}>
              {HOURS.map((h) => (
                <Pressable key={h} testID={`hour-${h}`} onPress={() => pickHour(h)} style={[styles.chip, reminderHour === h && styles.chipActive]}>
                  <RText weight="heavy" style={{ color: reminderHour === h ? colors.onBrandPrimary : colors.onSurfaceSecondary }}>
                    {String(h).padStart(2, "0")}:00
                  </RText>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {notifMsg ? <RText style={{ color: colors.warning, fontSize: font.sm, marginTop: spacing.sm }}>{notifMsg}</RText> : null}

        <PrimaryButton
          testID="logout-button"
          variant="secondary"
          label={t("logout")}
          onPress={onLogout}
          icon={<Ionicons name="log-out-outline" size={20} color={colors.error} />}
          style={{ marginTop: spacing["2xl"] }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { color: colors.onSurface, fontSize: font["2xl"] },
  idCard: { alignItems: "center", paddingVertical: spacing.xl },
  shareCard: { alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary },
  shareStats: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.lg },
  shareStat: { alignItems: "center" },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  gridItem: { width: "47%", alignItems: "center", paddingVertical: spacing.lg, flexGrow: 1 },
  gridVal: { color: colors.onSurface, fontSize: font["2xl"], marginTop: spacing.xs },
  gridLabel: { color: colors.muted, fontSize: font.sm, textAlign: "center", marginTop: 2 },
  sectionLabel: { color: colors.onSurface, fontSize: font.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  badgeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badge: { width: "31%", flexGrow: 1, alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, opacity: 0.7 },
  badgeEarned: { opacity: 1, borderColor: colors.brand },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  badgeProgTrack: { width: "80%", height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, marginTop: 6, overflow: "hidden" },
  badgeProgFill: { height: "100%", backgroundColor: colors.brand, borderRadius: 2 },
  reminderRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  switch: { width: 52, height: 30, borderRadius: 15, backgroundColor: colors.surfaceTertiary, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: colors.brand },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.muted },
  knobOn: { backgroundColor: colors.onBrandPrimary, alignSelf: "flex-end" },
});
