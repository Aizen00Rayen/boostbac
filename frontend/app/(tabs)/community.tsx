import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, FlatList, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, Card } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

type Resource = { resource_id: string; teacher_name: string; type: string; subject: string; title: string; description: string; has_attachment: boolean; created_at: string };
type Teacher = { user_id: string; name: string; picture?: string; resources: number };
type Conv = { conversation_id: string; other_name: string; last_message?: string };

const TYPE_ICON: Record<string, string> = { exam: "document-text", exercise: "create", solution: "checkmark-circle" };
const TYPE_COLOR: Record<string, string> = { exam: colors.warning, exercise: colors.brand, solution: colors.success };

export default function Community() {
  const { t, isRTL } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isTeacher = user?.role === "teacher";

  const [seg, setSeg] = useState<"posts" | "teachers" | "messages">(isTeacher ? "posts" : "posts");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [resources, setResources] = useState<Resource[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (seg === "posts") {
        const q = typeFilter === "all" ? "" : `?type=${typeFilter}`;
        setResources(await api<Resource[]>(`/resources${isTeacher ? "/mine" : q}`));
      } else if (seg === "teachers") {
        setTeachers(await api<Teacher[]>("/teachers"));
      } else {
        setConvs(await api<Conv[]>("/chat/conversations"));
      }
    } catch {} finally {
      setRefreshing(false);
    }
  }, [seg, typeFilter, isTeacher]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startChat = async (teacher: Teacher) => {
    try {
      const res = await api<{ conversation_id: string }>("/chat/start", { method: "POST", body: { other_user_id: teacher.user_id } });
      router.push({ pathname: "/chat/[id]", params: { id: res.conversation_id, name: teacher.name } });
    } catch {}
  };

  const segs: ("posts" | "teachers" | "messages")[] = isTeacher ? ["posts", "messages"] : ["posts", "teachers", "messages"];
  const segLabel = (s: string) => (s === "posts" ? (isTeacher ? t("myPosts") : t("posts")) : s === "teachers" ? t("teachers") : t("messages"));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <RText weight="heavy" style={styles.headerTitle}>{t("community")}</RText>
      </View>

      {/* Segmented */}
      <View style={styles.segRow}>
        {segs.map((s) => (
          <Pressable key={s} testID={`seg-${s}`} onPress={() => setSeg(s)} style={[styles.seg, seg === s && styles.segActive]}>
            <RText weight="bold" style={{ color: seg === s ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontSize: font.base }}>
              {segLabel(s)}
            </RText>
          </Pressable>
        ))}
      </View>

      {/* Type filter chips (posts, student feed only) */}
      {seg === "posts" && !isTeacher && (
        <View style={{ height: 56 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
            {["all", "exam", "exercise", "solution"].map((tp) => (
              <Pressable key={tp} testID={`filter-${tp}`} onPress={() => setTypeFilter(tp)} style={[styles.chip, typeFilter === tp && styles.chipActive]}>
                <RText weight="bold" style={{ color: typeFilter === tp ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontSize: font.sm }}>
                  {tp === "all" ? t("filterAll") : t(`type_${tp}`)}
                </RText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: seg === "posts" && !isTeacher ? 0 : spacing.md, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {seg === "posts" && (
          resources.length === 0 ? (
            <EmptyState icon="document-text-outline" label={t("noPosts")} />
          ) : (
            resources.map((r) => (
              <Pressable key={r.resource_id} testID={`post-${r.resource_id}`} onPress={() => router.push({ pathname: "/resource/[id]", params: { id: r.resource_id } })} style={styles.postCard}>
                <View style={[styles.typeIcon, { backgroundColor: (TYPE_COLOR[r.type] || colors.brand) + "22" }]}>
                  <Ionicons name={(TYPE_ICON[r.type] || "document") as any} size={20} color={TYPE_COLOR[r.type] || colors.brand} />
                </View>
                <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                  <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg }} numberOfLines={1}>{r.title}</RText>
                  <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 2 }} numberOfLines={1}>
                    {t(`type_${r.type}`)} · {r.subject}{isTeacher ? "" : ` · ${r.teacher_name}`}
                  </RText>
                </View>
                {r.has_attachment && <Ionicons name="attach" size={18} color={colors.brand} />}
                <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.muted} />
              </Pressable>
            ))
          )
        )}

        {seg === "teachers" && (
          teachers.length === 0 ? (
            <EmptyState icon="people-outline" label={t("noTeachers")} />
          ) : (
            teachers.map((tc) => (
              <View key={tc.user_id} style={styles.postCard} testID={`teacher-${tc.user_id}`}>
                <View style={styles.avatar}>
                  {tc.picture ? <Image source={{ uri: tc.picture }} style={{ width: 44, height: 44, borderRadius: 22 }} /> : <RText weight="heavy" style={{ color: colors.onBrandPrimary }}>{(tc.name || "?").charAt(0).toUpperCase()}</RText>}
                </View>
                <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                  <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg }}>{tc.name}</RText>
                  <RText style={{ color: colors.muted, fontSize: font.sm }}>{tc.resources} {t("posts")}</RText>
                </View>
                <Pressable testID={`chat-${tc.user_id}`} onPress={() => startChat(tc)} style={styles.chatBtn}>
                  <Ionicons name="chatbubble-ellipses" size={18} color={colors.onBrandPrimary} />
                </Pressable>
              </View>
            ))
          )
        )}

        {seg === "messages" && (
          convs.length === 0 ? (
            <EmptyState icon="chatbubbles-outline" label={t("noConversations")} />
          ) : (
            convs.map((c) => (
              <Pressable key={c.conversation_id} testID={`conv-${c.conversation_id}`} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: c.conversation_id, name: c.other_name } })} style={styles.postCard}>
                <View style={styles.avatar}><RText weight="heavy" style={{ color: colors.onBrandPrimary }}>{(c.other_name || "?").charAt(0).toUpperCase()}</RText></View>
                <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                  <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg }}>{c.other_name}</RText>
                  <RText style={{ color: colors.muted, fontSize: font.sm }} numberOfLines={1}>{c.last_message || "…"}</RText>
                </View>
                <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.muted} />
              </Pressable>
            ))
          )
        )}
      </ScrollView>

      {/* Teacher create FAB */}
      {isTeacher && seg === "posts" && (
        <Pressable testID="create-post-fab" onPress={() => router.push("/create-post")} style={[styles.fab, glow(colors.brand, 16), { bottom: insets.bottom + 78 }]}>
          <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
        </Pressable>
      )}
    </View>
  );
}

function EmptyState({ icon, label }: { icon: string; label: string }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: spacing["3xl"], marginTop: spacing.lg }}>
      <PaperPlane size={38} color={colors.brand} />
      <RText weight="bold" style={{ color: colors.onSurfaceSecondary, marginTop: spacing.md }}>{label}</RText>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { color: colors.onSurface, fontSize: font["2xl"] },
  segRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  seg: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  segActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipsContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  postCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  typeIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  chatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: spacing.lg, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
