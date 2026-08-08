import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Card } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

type Exam = { exam_id: string; score: number; correct: number; total: number; taken_at: string; topics_covered: string[] };

const OPTIONS = [5, 10, 15, 20];

export default function Exams() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [num, setNum] = useState(10);
  const [history, setHistory] = useState<Exam[]>([]);

  const load = useCallback(async () => {
    try {
      const h = await api<Exam[]>("/exams/history");
      setHistory(h);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <RText weight="heavy" style={styles.headerTitle}>
          {t("exams")}
        </RText>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <View style={styles.planeCircle}>
            <PaperPlane size={30} color={colors.brand} />
          </View>
          <RText weight="heavy" style={{ color: colors.onSurface, fontSize: font.xl, marginTop: spacing.md }}>
            {t("mockExam")}
          </RText>
          <RText style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 4 }}>
            {t("mockExamSub")}
          </RText>

          <RText weight="bold" style={{ color: colors.onSurface, alignSelf: "center", marginTop: spacing.lg }}>
            {t("questionsCount")}
          </RText>
          <View style={styles.optRow}>
            {OPTIONS.map((o) => (
              <Pressable key={o} testID={`exam-num-${o}`} onPress={() => setNum(o)} style={[styles.opt, num === o && styles.optActive]}>
                <RText weight="heavy" style={{ color: num === o ? colors.onBrandPrimary : colors.onSurfaceSecondary }}>
                  {o}
                </RText>
              </Pressable>
            ))}
          </View>

          <PrimaryButton
            testID="start-exam"
            label={t("startExam")}
            onPress={() => router.push({ pathname: "/exam", params: { num: String(num) } })}
            style={{ marginTop: spacing.lg, alignSelf: "stretch" }}
          />
        </Card>

        <RText weight="heavy" style={styles.sectionTitle}>
          {t("history")}
        </RText>
        {history.length === 0 ? (
          <RText style={{ color: colors.muted, textAlign: "center", marginTop: spacing.lg }}>{t("noExams")}</RText>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {history.map((e) => (
              <Card key={e.exam_id} style={styles.histRow} testID={`exam-hist-${e.exam_id}`}>
                <View style={[styles.scoreBadge, { borderColor: e.score >= 60 ? colors.success : colors.warning }]}>
                  <RText weight="heavy" style={{ color: e.score >= 60 ? colors.success : colors.warning, fontSize: font.lg }}>
                    {e.score}%
                  </RText>
                </View>
                <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                  <RText weight="bold" style={{ color: colors.onSurface }}>
                    {e.correct}/{e.total} · {(e.topics_covered || []).slice(0, 2).join(", ")}
                  </RText>
                  <RText style={{ color: colors.muted, fontSize: font.sm }}>
                    {new Date(e.taken_at).toLocaleDateString()}
                  </RText>
                </View>
                <Ionicons name="ribbon" size={22} color={colors.brand} />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { color: colors.onSurface, fontSize: font["2xl"] },
  hero: { alignItems: "center", paddingVertical: spacing.xl },
  planeCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  optRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  opt: { width: 56, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  optActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  sectionTitle: { color: colors.onSurface, fontSize: font.xl, marginVertical: spacing.lg },
  histRow: { flexDirection: "row", alignItems: "center" },
  scoreBadge: { width: 56, height: 56, borderRadius: radius.md, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
