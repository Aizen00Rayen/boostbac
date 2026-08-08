import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useI18n, Lang } from "@/src/i18n";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, Card, PrimaryButton } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

const STREAMS = ["math", "science", "tech", "management", "letters", "languages"] as const;
const GOALS = [10, 20, 30, 50];

export default function Profile() {
  const { t, lang, setLang } = useI18n();
  const { user, logout, setUser, refresh } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [home, setHome] = useState<{ mastered_cards: number; longest_streak: number; current_streak: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, me] = await Promise.all([api<any>("/home"), api<any>("/auth/me")]);
      setHome({ mastered_cards: h.mastered_cards, longest_streak: h.longest_streak, current_streak: h.current_streak });
      setUser(me);
    } catch {}
  }, [setUser]);

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

  if (!user) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <RText weight="heavy" style={styles.headerTitle}>
          {t("profile")}
        </RText>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <Card style={styles.idCard}>
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
        </Card>

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
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  gridItem: { width: "47%", alignItems: "center", paddingVertical: spacing.lg, flexGrow: 1 },
  gridVal: { color: colors.onSurface, fontSize: font["2xl"], marginTop: spacing.xs },
  gridLabel: { color: colors.muted, fontSize: font.sm, textAlign: "center", marginTop: 2 },
  sectionLabel: { color: colors.onSurface, fontSize: font.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
});
