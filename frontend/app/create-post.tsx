import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Field } from "@/src/components/ui";

const TYPES = ["exam", "exercise", "solution"] as const;

export default function CreatePost() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<string>("exercise");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attach, setAttach] = useState<{ b64: string; mime: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
    if (!res.canceled && res.assets[0]?.base64) setAttach({ b64: res.assets[0].base64, mime: res.assets[0].mimeType || "image/jpeg" });
  };
  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      setAttach({ b64, mime: "application/pdf" });
    } catch (e: any) { setErr(e?.message || "Error"); }
  };

  const publish = async () => {
    setErr("");
    if (!title.trim() || !subject.trim()) { setErr(t("titleField") + " / " + t("subjectField")); return; }
    setSaving(true);
    try {
      await api("/resources", {
        method: "POST",
        body: { type, subject: subject.trim(), title: title.trim(), description: description.trim(), attachment_base64: attach?.b64, attachment_mime: attach?.mime },
        timeout: 30000,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { setErr(e?.message || "Error"); } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="post-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.onSurfaceSecondary} />
        </Pressable>
        <RText weight="heavy" style={styles.title}>{t("createPost")}</RText>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }} bottomOffset={20} showsVerticalScrollIndicator={false}>
        <RText weight="bold" style={styles.label}>{t("postType")}</RText>
        <View style={styles.typeRow}>
          {TYPES.map((tp) => (
            <Pressable key={tp} testID={`ptype-${tp}`} onPress={() => setType(tp)} style={[styles.typeChip, type === tp && styles.chipActive]}>
              <RText weight="bold" style={{ color: type === tp ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontSize: font.base }}>{t(`type_${tp}`)}</RText>
            </Pressable>
          ))}
        </View>

        <Field testID="post-subject" placeholder={t("subjectField")} value={subject} onChangeText={setSubject} />
        <Field testID="post-title" placeholder={t("titleField")} value={title} onChangeText={setTitle} />
        <Field testID="post-desc" placeholder={t("descField")} value={description} onChangeText={setDescription} multiline style={styles.multi} />

        <View style={styles.attachRow}>
          <Pressable testID="attach-image" onPress={pickImage} style={styles.attachBtn}>
            <Ionicons name="image" size={20} color={colors.brand} />
            <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{t("attachImage")}</RText>
          </Pressable>
          <Pressable testID="attach-pdf" onPress={pickPdf} style={styles.attachBtn}>
            <Ionicons name="document-text" size={20} color={colors.brand} />
            <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{t("attachPdf")}</RText>
          </Pressable>
        </View>
        {attach && (
          <View style={styles.attachedTag}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <RText weight="bold" style={{ color: colors.success }}>{t("attached")}</RText>
            <Pressable onPress={() => setAttach(null)} hitSlop={10}><Ionicons name="close" size={18} color={colors.muted} /></Pressable>
          </View>
        )}
        {err ? <RText style={{ color: colors.error }}>{err}</RText> : null}
      </KeyboardAwareScrollView>

      <View style={[styles.sticky, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton testID="publish-post" label={t("publish")} onPress={publish} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: font.lg },
  label: { color: colors.onSurfaceSecondary, fontSize: font.base },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeChip: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  multi: { height: undefined, minHeight: 120, paddingTop: spacing.md, textAlignVertical: "top" },
  attachRow: { flexDirection: "row", gap: spacing.md },
  attachBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  attachedTag: { flexDirection: "row", alignItems: "center", gap: 8 },
  sticky: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
