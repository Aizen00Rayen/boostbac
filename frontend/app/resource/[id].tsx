import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText } from "@/src/components/ui";
import { PaperPlaneLoader } from "@/src/components/graphics";

type Resource = {
  resource_id: string;
  teacher_name?: string;
  type: string;
  subject: string;
  title: string;
  description: string;
  attachment_base64?: string | null;
  attachment_mime?: string | null;
  created_at: string;
};

export default function ResourceViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<Resource>(`/resources/${id}`);
        setResource(r);
      } catch {
        // leave resource null — render "not found" state below
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const attachmentUri = resource?.attachment_base64
    ? `data:${resource.attachment_mime};base64,${resource.attachment_base64}`
    : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="resource-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.onSurfaceSecondary} />
        </Pressable>
        <RText weight="heavy" style={styles.headerTitle} numberOfLines={1}>{resource?.title || ""}</RText>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <PaperPlaneLoader label={t("loading")} />
        </View>
      ) : !resource ? (
        <View style={styles.centered}>
          <RText style={{ color: colors.onSurfaceSecondary }}>{t("resourceNotFound")}</RText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{t(`type_${resource.type}`)}</RText>
            </View>
            <View style={styles.tag}>
              <RText weight="bold" style={{ color: colors.onSurfaceTertiary, fontSize: font.sm }}>{resource.subject}</RText>
            </View>
          </View>
          <RText weight="heavy" style={styles.title}>{resource.title}</RText>
          {resource.teacher_name ? (
            <RText style={{ color: colors.muted, fontSize: font.sm, marginTop: 4 }}>{resource.teacher_name}</RText>
          ) : null}
          {resource.description ? (
            <RText weight="medium" style={styles.description}>{resource.description}</RText>
          ) : null}

          {attachmentUri ? (
            resource.attachment_mime === "application/pdf" ? (
              <WebView source={{ uri: attachmentUri }} style={styles.attachmentPdf} scalesPageToFit />
            ) : (
              <Image source={{ uri: attachmentUri }} style={styles.attachmentImage} contentFit="contain" />
            )
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: font.lg, flex: 1, textAlign: "center" },
  tagRow: { flexDirection: "row", gap: spacing.sm },
  tag: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  title: { color: colors.onSurface, fontSize: font["2xl"], marginTop: spacing.md },
  description: { color: colors.onSurfaceSecondary, fontSize: font.lg, lineHeight: 26, marginTop: spacing.lg },
  attachmentImage: { width: "100%", height: 400, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginTop: spacing.xl },
  attachmentPdf: { width: "100%", height: 500, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginTop: spacing.xl },
});
