import { useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, ApiError, localizeError } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, PrimaryButton, Field, Card } from "@/src/components/ui";
import { PaperPlaneLoader, PaperPlane } from "@/src/components/graphics";

type CardT = { id: string; question: string; answer: string; topic: string; difficulty: string };
type Step = "capture" | "generating" | "review";

export default function Scan() {
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const { chapter_id, chapter_name } = useLocalSearchParams<{ chapter_id?: string; chapter_name?: string }>();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>("capture");
  const [deck, setDeck] = useState<any>(null);
  const [cards, setCards] = useState<CardT[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attachment, setAttachment] = useState<{ base64: string; mime: string } | null>(null);

  const generate = async (image_base64: string, mime: string) => {
    setStep("generating");
    setError("");
    try {
      const res = await api<{ deck: any; cards: CardT[] }>("/decks/generate", {
        method: "POST",
        body: { image_base64, mime_type: mime },
        timeout: 90000,
      });
      setDeck(res.deck);
      setCards(res.cards);
      setAttachment({ base64: image_base64, mime });
      setStep("review");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e instanceof ApiError && e.status === 422 ? t("errorNoExercises") : localizeError(e, t));
      setStep("capture");
    }
  };

  const takePhoto = async () => {
    try {
      const pic = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
      if (pic?.base64) await generate(pic.base64, "image/jpeg");
    } catch (e: any) {
      setError(localizeError(e, t));
    }
  };

  const pickGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.6,
    });
    if (!res.canceled && res.assets[0]?.base64) {
      await generate(res.assets[0].base64, res.assets[0].mimeType || "image/jpeg");
    }
  };

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      await generate(b64, "application/pdf");
    } catch (e: any) {
      setError(localizeError(e, t));
    }
  };

  const saveDeck = async () => {
    setSaving(true);
    try {
      const deckToSave = { ...deck };
      if (attachment) {
        deckToSave.attachment_base64 = attachment.base64;
        deckToSave.attachment_mime = attachment.mime;
      }
      if (chapter_id) deckToSave.chapter_id = chapter_id;
      await api("/decks/save", { method: "POST", body: { deck: deckToSave, cards } });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      setError(localizeError(e, t));
    } finally {
      setSaving(false);
    }
  };

  const updateCard = (id: string, field: "question" | "answer", val: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: val } : c)));
  };
  const removeCard = (id: string) => setCards((prev) => prev.filter((c) => c.id !== id));

  // ---- generating ----
  if (step === "generating") {
    return (
      <View style={styles.centered}>
        <PaperPlaneLoader size={60} label={t("generating")} />
      </View>
    );
  }

  // ---- review/edit ----
  if (step === "review") {
    return (
      <View style={styles.container}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable testID="scan-close" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color={colors.onSurfaceSecondary} />
          </Pressable>
          <RText weight="heavy" style={styles.modalTitle} numberOfLines={1}>
            {deck?.deck_name}
          </RText>
          <View style={{ width: 44 }} />
        </View>
        <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} bottomOffset={90} showsVerticalScrollIndicator={false}>
          {chapter_name ? (
            <View style={styles.chapterBanner} testID="chapter-banner">
              <Ionicons name="map" size={16} color={colors.brand} />
              <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{chapter_name}</RText>
            </View>
          ) : null}
          <RText style={{ color: colors.onSurfaceSecondary, marginBottom: spacing.md }}>{t("reviewCards")} · {cards.length}</RText>
          {cards.map((c, i) => (
            <Card key={c.id} style={{ marginBottom: spacing.md }} testID={`edit-card-${i}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                <View style={styles.diffTag}>
                  <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{c.topic || deck?.topic}</RText>
                </View>
                <Pressable testID={`delete-card-${i}`} onPress={() => removeCard(c.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
              </View>
              <RText weight="bold" style={styles.fieldLabel}>{t("question")}</RText>
              <Field value={c.question} onChangeText={(v) => updateCard(c.id, "question", v)} multiline style={styles.multiField} />
              <RText weight="bold" style={styles.fieldLabel}>{t("answer")}</RText>
              <Field value={c.answer} onChangeText={(v) => updateCard(c.id, "answer", v)} multiline style={styles.multiField} />
            </Card>
          ))}
        </KeyboardAwareScrollView>
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton testID="save-deck" label={`${t("saveDeck")} (${cards.length})`} onPress={saveDeck} loading={saving} disabled={cards.length === 0} />
        </View>
      </View>
    );
  }

  // ---- capture (permission handling) ----
  const renderPermission = () => (
    <View style={styles.centered}>
      <PaperPlane size={48} color={colors.brand} />
      <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg, textAlign: "center", marginTop: spacing.lg }}>
        {t("cameraPermission")}
      </RText>
      {permission?.canAskAgain !== false ? (
        <PrimaryButton testID="grant-camera" label={t("grantPermission")} onPress={requestPermission} style={{ marginTop: spacing.xl, width: 240 }} />
      ) : (
        <PrimaryButton testID="open-settings" label={t("openSettings")} onPress={() => Linking.openSettings()} style={{ marginTop: spacing.xl, width: 240 }} />
      )}
      <Pressable onPress={pickGallery} style={{ marginTop: spacing.lg }}>
        <RText weight="bold" style={{ color: colors.brand }}>{t("fromGallery")}</RText>
      </Pressable>
      <Pressable testID="pick-pdf-fallback" onPress={pickPdf} style={{ marginTop: spacing.md }}>
        <RText weight="bold" style={{ color: colors.brand }}>{t("pdfUpload")}</RText>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="scan-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.onSurfaceSecondary} />
        </Pressable>
        <RText weight="heavy" style={styles.modalTitle}>{t("scanTitle")}</RText>
        <View style={{ width: 44 }} />
      </View>

      {!permission || !permission.granted ? (
        renderPermission()
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <View style={styles.frameGuide} pointerEvents="none" />
          </View>
          {error ? (
            <RText testID="scan-error" style={{ color: colors.error, textAlign: "center", marginTop: spacing.md }}>{error}</RText>
          ) : null}
          <View style={[styles.captureBar, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Pressable testID="pick-gallery" onPress={pickGallery} style={styles.galleryBtn}>
              <Ionicons name="images" size={24} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="take-photo" onPress={takePhoto} style={[styles.shutter, glow(colors.brand, 16)]}>
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable testID="pick-pdf" onPress={pickPdf} style={styles.galleryBtn}>
              <Ionicons name="document-text" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  modalTitle: { color: colors.onSurface, fontSize: font.lg, flex: 1, textAlign: "center" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  cameraWrap: { flex: 1, margin: spacing.lg, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000" },
  frameGuide: { position: "absolute", top: 40, left: 24, right: 24, bottom: 40, borderWidth: 2, borderColor: colors.brand, borderRadius: radius.md, borderStyle: "dashed" },
  captureBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  galleryBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  shutter: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 62, height: 62, borderRadius: 31, borderWidth: 4, borderColor: colors.surface, backgroundColor: colors.brand },
  diffTag: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  chapterBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  fieldLabel: { color: colors.onSurfaceSecondary, fontSize: font.sm, marginBottom: 6, marginTop: spacing.sm },
  multiField: { height: undefined, minHeight: 54, paddingTop: spacing.md, paddingBottom: spacing.md, textAlignVertical: "top" },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
