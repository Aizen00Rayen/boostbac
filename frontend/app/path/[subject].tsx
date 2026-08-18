import { useCallback, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius, darken, softShadow } from "@/src/theme";
import { RText, PrimaryButton } from "@/src/components/ui";
import { PaperPlane, PaperPlaneLoader } from "@/src/components/graphics";

type Chapter = {
  chapter_id: string;
  name: string;
  name_ar?: string | null;
  order_index: number;
  total_cards: number;
  due_cards: number;
  mastered_cards: number;
  has_official_content: boolean;
};
type PathResp = { subject: string; stream: string; chapters: Chapter[] };

const OFFSET = 46;

function nodeState(ch: Chapter): "locked" | "ready" | "mastered" {
  if (ch.total_cards === 0) return "locked";
  if (ch.mastered_cards >= ch.total_cards) return "mastered";
  return "ready";
}

export default function PathScreen() {
  const { subject } = useLocalSearchParams<{ subject: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useI18n();

  const [data, setData] = useState<PathResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<PathResp>(`/path/${subject}`);
      setData(res);
      setUnavailable(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [subject]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperPlaneLoader label={t("loading")} />
      </View>
    );
  }

  if (unavailable || !data) {
    return (
      <View style={styles.centered}>
        <PaperPlane size={40} color={colors.muted} />
        <RText weight="bold" style={{ color: colors.onSurface, marginTop: spacing.lg }}>{t("resourceNotFound")}</RText>
        <PrimaryButton testID="path-back" label={t("back")} onPress={() => router.back()} style={{ marginTop: spacing.xl, width: 200 }} />
      </View>
    );
  }

  const chapterName = (ch: Chapter) => (isRTL && ch.name_ar ? ch.name_ar : ch.name);

  const onNodePress = async (ch: Chapter) => {
    const state = nodeState(ch);
    if (state !== "locked") {
      router.push({ pathname: "/lesson/[chapter_id]", params: { chapter_id: ch.chapter_id, name: chapterName(ch) } });
      return;
    }
    if (ch.has_official_content) {
      setUnlocking(ch.chapter_id);
      try {
        await api(`/path/chapters/${ch.chapter_id}/unlock-official`, { method: "POST" });
        router.push({ pathname: "/lesson/[chapter_id]", params: { chapter_id: ch.chapter_id, name: chapterName(ch) } });
        return;
      } catch {
        // fall through to scan flow if unlocking official content fails
      } finally {
        setUnlocking(null);
      }
    }
    router.push({ pathname: "/scan", params: { chapter_id: ch.chapter_id, chapter_name: chapterName(ch) } });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="path-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={colors.onSurfaceSecondary} />
        </Pressable>
        <RText weight="heavy" style={styles.headerTitle}>{t(`subject_${subject}`)}</RText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingVertical: spacing["2xl"], paddingBottom: insets.bottom + spacing["3xl"] }} showsVerticalScrollIndicator={false}>
        {data.chapters.map((ch, i) => {
          const state = nodeState(ch);
          const side = i % 2 === 0 ? -1 : 1;
          const dir = isRTL ? -1 : 1;
          return (
            <View key={ch.chapter_id} style={styles.nodeRow}>
              <View style={[styles.nodeWrap, { transform: [{ translateX: side * dir * OFFSET }] }]}>
                <View style={styles.nodeStack}>
                  {state !== "locked" && (
                    <View
                      style={[
                        styles.nodeShadowCircle,
                        { backgroundColor: darken(state === "mastered" ? colors.success : colors.brand, 0.22) },
                      ]}
                    />
                  )}
                  <Pressable
                    testID={`chapter-node-${i}`}
                    onPress={() => onNodePress(ch)}
                    disabled={unlocking === ch.chapter_id}
                    style={[
                      styles.node,
                      state === "locked" && styles.nodeLocked,
                      state === "ready" && { backgroundColor: colors.brand },
                      state === "mastered" && { backgroundColor: colors.success },
                    ]}
                  >
                    {unlocking === ch.chapter_id ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <>
                        {state === "locked" && <Ionicons name="lock-closed" size={22} color={colors.muted} />}
                        {state === "ready" && <Ionicons name="book" size={26} color={colors.onBrandPrimary} />}
                        {state === "mastered" && <Ionicons name="checkmark-done" size={26} color={colors.onBrandPrimary} />}
                      </>
                    )}
                  </Pressable>
                  {state === "locked" && ch.has_official_content && (
                    <View style={styles.officialBadge} testID={`official-badge-${i}`}>
                      <Ionicons name="star" size={13} color={colors.onBrandPrimary} />
                    </View>
                  )}
                  {state === "ready" && ch.due_cards > 0 && (
                    <View style={styles.dueBadge}>
                      <RText weight="heavy" style={{ color: colors.onBrandPrimary, fontSize: font.sm }}>{ch.due_cards}</RText>
                    </View>
                  )}
                </View>
                <RText weight="bold" style={styles.nodeLabel} numberOfLines={2}>{chapterName(ch)}</RText>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: font.lg },
  nodeRow: { alignItems: "center", marginBottom: spacing["2xl"] },
  nodeWrap: { alignItems: "center", width: 140 },
  node: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow(0.08, 8),
  },
  nodeLocked: { backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.border },
  nodeLabel: { color: colors.onSurface, fontSize: font.sm, textAlign: "center", marginTop: spacing.sm },
  nodeStack: { width: 76, height: 82, alignItems: "center" },
  nodeShadowCircle: { position: "absolute", top: 6, width: 76, height: 76, borderRadius: 38 },
  dueBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  officialBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
