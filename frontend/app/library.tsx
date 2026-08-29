import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, Image as RNImage } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, Card, Chip, ProgressBar } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";

type Exercise = { exercise_id: string; subject: string; captured_at: string; total_questions: number; attempted_questions: number };

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (diffDays === 0) return "اليوم";
  if (diffDays === 1) return "البارح";
  return d.toLocaleDateString("ar-DZ", { day: "numeric", month: "long" });
}

function Thumb({ exerciseId }: { exerciseId: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ source_image_base64: string; source_mime: string }>(`/exercises/${exerciseId}/image`)
      .then((r) => { if (alive) setUri(`data:${r.source_mime};base64,${r.source_image_base64}`); })
      .catch(() => {});
    return () => { alive = false; };
  }, [exerciseId]);
  if (!uri) return <View style={styles.thumbPlaceholder}><Ionicons name="image-outline" size={20} color={colors.muted} /></View>;
  return <RNImage source={{ uri }} style={styles.thumb} />;
}

export default function Library() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Exercise[] | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    api<Exercise[]>("/library").then(setItems).catch(() => setItems([]));
  }, []);

  const subjects = useMemo(() => Array.from(new Set((items || []).map((i) => i.subject))), [items]);
  const filtered = useMemo(
    () => (filter === "all" ? items || [] : (items || []).filter((i) => i.subject === filter)),
    [items, filter],
  );

  if (!items) {
    return <View style={styles.centered}><PaperPlaneLoader label={t("loading")} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="library-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <RText weight="heavy" style={styles.wordmark}>BoostBac</RText>
        <View style={styles.iconBtn} />
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <RText weight="heavy" style={styles.title}>{t("libraryTitle")}</RText>
        <RText style={styles.subtitle}>{t("librarySubtitle")}</RText>
      </View>

      {items.length === 0 ? (
        <View style={styles.centered}>
          <PaperPlane size={56} />
          <RText style={{ color: colors.muted, marginTop: spacing.md }}>{t("libraryEmpty")}</RText>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.exercise_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
              <Chip label={t("libraryFilterAll")} selected={filter === "all"} onPress={() => setFilter("all")} />
              {subjects.map((s) => (
                <Chip key={s} label={s} selected={filter === s} onPress={() => setFilter(s)} />
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <Card style={styles.row} testID={`library-item-${item.exercise_id}`}>
              <View style={{ flex: 1 }}>
                <View style={styles.subjectTag}>
                  <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{item.subject}</RText>
                </View>
                <RText weight="bold" style={{ color: colors.onSurface, marginTop: spacing.sm }}>{relativeDate(item.captured_at)}</RText>
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar progress={item.total_questions ? item.attempted_questions / item.total_questions : 0} />
                </View>
                <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 4 }}>
                  {t("libraryQuestionsDone", { done: item.attempted_questions, total: item.total_questions })}
                </RText>
              </View>
              <Thumb exerciseId={item.exercise_id} />
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  wordmark: { color: colors.onSurface, fontSize: font.lg },
  title: { color: colors.onSurface, fontSize: font["2xl"], marginTop: spacing.sm },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: font.sm, marginTop: 2, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  subjectTag: { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  thumbPlaceholder: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
});
