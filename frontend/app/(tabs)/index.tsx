import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Card, ProgressBar } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";

type Subject = { subject: string; correct: number; total: number };
type Home = { total_due: number; has_exercises: boolean; zero_data: boolean; subjects: Subject[]; current_streak: number };

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<Home>("/home");
      setData(res);
    } catch {
      // keep last-known data on a transient refresh failure, but never leave a
      // first load stuck on the spinner forever with nothing to show.
      setData((prev) => prev ?? { total_due: 0, has_exercises: false, zero_data: true, subjects: [], current_streak: 0 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable testID="home-settings" onPress={() => router.push("/settings")} style={styles.iconBtn}>
        <Ionicons name="settings-outline" size={22} color={colors.onSurfaceSecondary} />
      </Pressable>
      <RText weight="heavy" style={styles.wordmark}>BoostBac</RText>
      <View style={styles.iconBtn} />
    </View>
  );

  if (loading || !data) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centered}><PaperPlaneLoader label={t("loading")} /></View>
      </View>
    );
  }

  if (data.zero_data) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.zeroWrap}>
          <Card style={styles.zeroCard}>
            <PaperPlane size={72} />
            <RText weight="heavy" style={styles.zeroTitle}>{t("homeZeroTitle")}</RText>
            <RText weight="regular" style={styles.zeroBody}>{t("homeZeroBody")}</RText>
            <PrimaryButton
              testID="home-capture-cta"
              label={t("homeZeroCta")}
              icon={<Ionicons name="camera" size={18} color={colors.onBrandPrimary} />}
              onPress={() => router.push("/capture")}
              style={{ marginTop: spacing.xl, width: "100%" }}
            />
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <RText weight="heavy" style={styles.greeting}>{t("homeGreeting")}</RText>
        <RText weight="medium" style={styles.dueSubtitle}>
          {data.total_due > 0 ? t("homeDueSubtitle", { n: data.total_due }) : t("homeDueSubtitleZero")}
        </RText>

        {data.subjects.length > 0 && (
          <Card style={{ marginTop: spacing.xl }}>
            <RText weight="bold" style={styles.cardTitle}>{t("homeStatusCardTitle")}</RText>
            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              {data.subjects.map((s) => (
                <View key={s.subject}>
                  <View style={styles.subjectRow}>
                    <RText weight="medium" style={{ color: colors.onSurface }}>{s.subject}</RText>
                    <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{s.correct}/{s.total} {t("homePoints")}</RText>
                  </View>
                  <ProgressBar progress={s.total ? s.correct / s.total : 0} />
                </View>
              ))}
            </View>
          </Card>
        )}

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          {data.total_due > 0 && (
            <PrimaryButton
              testID="home-start-review"
              label={t("homeStartReview")}
              icon={<Ionicons name="play" size={18} color={colors.onBrandPrimary} />}
              onPress={() => router.push("/review")}
            />
          )}
          <PrimaryButton
            testID="home-capture-new"
            label={t("homeCaptureNew")}
            variant={data.total_due > 0 ? "secondary" : "primary"}
            icon={<Ionicons name="camera" size={18} color={data.total_due > 0 ? colors.brand : colors.onBrandPrimary} />}
            onPress={() => router.push("/capture")}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  wordmark: { color: colors.onSurface, fontSize: font.lg },
  zeroWrap: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  zeroCard: { alignItems: "center", padding: spacing["2xl"] },
  zeroTitle: { color: colors.onSurface, fontSize: font.xl, textAlign: "center", marginTop: spacing.lg },
  zeroBody: { color: colors.onSurfaceSecondary, fontSize: font.base, textAlign: "center", marginTop: spacing.sm, lineHeight: 22 },
  greeting: { color: colors.onSurface, fontSize: font["3xl"] },
  dueSubtitle: { color: colors.onSurfaceSecondary, fontSize: font.lg, marginTop: 4 },
  cardTitle: { color: colors.onSurface, fontSize: font.lg },
  subjectRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
});
