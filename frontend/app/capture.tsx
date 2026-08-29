import { useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Linking, Image as RNImage } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, ApiError, localizeError } from "@/src/api";
import { useI18n, MISTAKE_REASONS, MistakeReason } from "@/src/i18n";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, PrimaryButton, Field, Card, OptionRow } from "@/src/components/ui";
import { PaperPlaneLoader, PaperPlane } from "@/src/components/graphics";
import { formatExerciseText } from "@/src/utils/formatText";

type Page = { base64: string; mime: string };
type QuestionStub = {
  question_id: string;
  order_index: number;
  subject: string;
  skill_tag: string;
  text: string;
  shared_context: string;
  question_type: string;
};
type Step = "capture" | "processing" | "question" | "reveal" | "mistake" | "finished";

const MAX_PAGES = 8;
const CAPTURE_QUALITY = 0.7;

const MISTAKE_ICONS: Record<MistakeReason, keyof typeof Ionicons.glyphMap> = {
  concept: "bulb-outline",
  formula: "calculator-outline",
  procedure: "git-branch-outline",
  calculation: "keypad-outline",
  calculator: "hardware-chip-outline",
  rushed: "time-outline",
};

export default function Capture() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [step, setStep] = useState<Step>("capture");
  const [pages, setPages] = useState<Page[]>([]);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [questions, setQuestions] = useState<QuestionStub[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<{ answer: string; confidence: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showContext, setShowContext] = useState(false);
  const attemptStartRef = useRef(Date.now());
  const [correctCount, setCorrectCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const addPage = (base64: string, mime: string) => {
    setError("");
    setPages((prev) => (prev.length >= MAX_PAGES ? prev : [...prev, { base64, mime }]));
    Haptics.selectionAsync();
  };
  const removePage = (i: number) => setPages((prev) => prev.filter((_, idx) => idx !== i));

  const generate = async () => {
    if (pages.length === 0) return;
    setStep("processing");
    setError("");
    try {
      const res = await api<{ exercise_id: string; questions: QuestionStub[] }>("/exercises", {
        method: "POST",
        body: { images: pages.map((p) => ({ data: p.base64, mime_type: p.mime })), hint: hint.trim() || undefined },
        timeout: 60000 + pages.length * 20000,
      });
      if (!res.questions?.length) throw new ApiError(422, "empty");
      setQuestions(res.questions);
      setIndex(0);
      attemptStartRef.current = Date.now();
      setStep("question");
    } catch (e: any) {
      setError(e instanceof ApiError && e.status === 422 ? t("errorNoQuestions") : localizeError(e, t));
      setStep("capture");
    }
  };

  const takePhoto = async () => {
    if (pages.length >= MAX_PAGES) { setError(t("studyCaptureMaxPages")); return; }
    setBusy(true);
    try {
      const pic = await cameraRef.current?.takePictureAsync({ base64: true, quality: CAPTURE_QUALITY });
      if (pic?.base64) addPage(pic.base64, "image/jpeg");
    } catch (e: any) {
      setError(localizeError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const pickGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], base64: true, quality: CAPTURE_QUALITY, allowsMultipleSelection: true, selectionLimit: MAX_PAGES,
    });
    if (res.canceled) return;
    for (const asset of res.assets) if (asset.base64) addPage(asset.base64, asset.mimeType || "image/jpeg");
  };

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      addPage(b64, "application/pdf");
    } catch (e: any) {
      setError(localizeError(e, t));
    }
  };

  const reveal = async () => {
    Haptics.selectionAsync();
    const q = questions[index];
    const secs = Math.max(1, Math.round((Date.now() - attemptStartRef.current) / 1000));
    setElapsed(secs);
    try {
      const res = await api<{ answer: string; confidence: string }>(`/questions/${q.question_id}/reveal`, {
        method: "POST", body: { time_spent_seconds: secs },
      });
      setAnswer(res);
      setStep("reveal");
    } catch (e: any) {
      setError(localizeError(e, t));
    }
  };

  const advance = () => {
    setShowContext(false);
    setAnswer(null);
    if (index + 1 >= questions.length) {
      setStep("finished");
    } else {
      setIndex((i) => i + 1);
      attemptStartRef.current = Date.now();
      setStep("question");
    }
  };

  const reportCorrect = async (correct: boolean) => {
    const q = questions[index];
    if (correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCorrectCount((c) => c + 1);
      try {
        await api(`/questions/${q.question_id}/attempt`, { method: "POST", body: { time_spent_seconds: elapsed, correct: true } });
      } catch {}
      advance();
    } else {
      setRedoCount((c) => c + 1);
      setStep("mistake");
    }
  };

  const reportMistake = async (reason: MistakeReason) => {
    const q = questions[index];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api(`/questions/${q.question_id}/attempt`, {
        method: "POST", body: { time_spent_seconds: elapsed, correct: false, mistake_reason: reason },
      });
    } catch {}
    advance();
  };

  // ---- processing ----
  if (step === "processing") {
    return (
      <View style={styles.centered}>
        <PaperPlaneLoader size={64} label={t("studyProcessingLoader")} />
        <RText weight="heavy" style={styles.processingTitle}>{t("studyProcessingTitle")}</RText>
        <RText weight="regular" style={styles.processingBody}>{t("studyProcessingBody")}</RText>
      </View>
    );
  }

  // ---- finished ----
  if (step === "finished") {
    return (
      <View style={[styles.centered, { padding: spacing.xl }]} testID="capture-finished">
        <PaperPlane size={72} />
        <RText weight="heavy" style={styles.processingTitle}>{t("reviewDone")}</RText>
        <RText weight="medium" style={{ color: colors.onSurfaceSecondary, marginTop: spacing.sm }}>
          {t("reviewDoneSummary", { correct: correctCount, redo: redoCount })}
        </RText>
        <PrimaryButton testID="capture-back-home" label={t("reviewBackHome")} onPress={() => router.back()} style={{ marginTop: spacing["2xl"], width: 260 }} />
      </View>
    );
  }

  // ---- question / reveal / mistake (session) ----
  if (step === "question" || step === "reveal" || step === "mistake") {
    const q = questions[index];
    const progress = `${index + 1} / ${questions.length}`;
    return (
      <View style={styles.container}>
        <View style={[styles.sessionHeader, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable testID="capture-close" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
          </Pressable>
          <View style={styles.progressTrackWrap}>
            <RText weight="bold" style={styles.progressLabel}>{t("studyQuestionProgress", { i: index + 1, n: questions.length })}</RText>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <View style={styles.subjectTag}>
            <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{q.subject} · {q.skill_tag}</RText>
          </View>

          <Card style={{ marginTop: spacing.md }}>
            <RText weight="medium" style={styles.qText}>{formatExerciseText(q.text)}</RText>
          </Card>

          {q.shared_context ? (
            <Pressable testID="capture-toggle-context" onPress={() => setShowContext((s) => !s)} style={styles.contextLink}>
              <Ionicons name={showContext ? "chevron-up" : "document-text-outline"} size={16} color={colors.brand} />
              <RText weight="bold" style={{ color: colors.brand, fontSize: font.sm }}>{t("studyContextLink")}</RText>
            </Pressable>
          ) : null}
          {showContext && q.shared_context ? (
            <Card style={{ marginTop: spacing.sm, backgroundColor: colors.surfaceSecondary }}>
              <RText style={{ color: colors.onSurfaceSecondary }}>{formatExerciseText(q.shared_context)}</RText>
            </Card>
          ) : null}

          {step !== "question" && answer ? (
            <View style={{ marginTop: spacing.xl }}>
              <RText weight="heavy" style={styles.solutionTitle}>{t("solutionTitle")}</RText>
              <Card style={{ marginTop: spacing.sm, backgroundColor: colors.brandTertiary, borderWidth: 0 }}>
                <RText weight="medium" style={styles.aText}>{formatExerciseText(answer.answer)}</RText>
              </Card>
              {answer.confidence === "needs_review" ? (
                <RText style={styles.confidenceNote}>{t("needsReviewNote")}</RText>
              ) : null}
            </View>
          ) : null}

          {step === "mistake" ? (
            <View style={{ marginTop: spacing.xl }}>
              <View style={{ alignItems: "center", marginBottom: spacing.md }}>
                <PaperPlane size={44} />
              </View>
              <RText weight="heavy" style={[styles.solutionTitle, { textAlign: "center" }]}>{t("mistakeTitle")}</RText>
              <RText style={{ color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 4 }}>{t("mistakeSubtitle")}</RText>
              <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                {MISTAKE_REASONS.map((r) => (
                  <OptionRow
                    key={r}
                    testID={`mistake-${r}`}
                    label={t(`mistake_${r}`)}
                    selected={false}
                    onPress={() => reportMistake(r)}
                    icon={<Ionicons name={MISTAKE_ICONS[r]} size={20} color={colors.onSurfaceSecondary} />}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {error ? <RText style={{ color: colors.error, marginTop: spacing.md, textAlign: "center" }}>{error}</RText> : null}
        </ScrollView>

        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + spacing.md }]}>
          {step === "question" ? (
            <>
              <RText style={styles.hintText}>{t("studyTakeYourTime")}</RText>
              <PrimaryButton
                testID="study-solved-it"
                label={t("studySolvedIt")}
                icon={<Ionicons name="checkmark-circle" size={20} color={colors.onBrandPrimary} />}
                onPress={reveal}
              />
            </>
          ) : step === "reveal" ? (
            <>
              <RText weight="bold" style={styles.hintText}>{t("howWasIt")}</RText>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <PrimaryButton
                  testID="report-wrong"
                  variant="secondary"
                  label={t("gotItWrong")}
                  icon={<Ionicons name="close-circle" size={18} color={colors.brand} />}
                  onPress={() => reportCorrect(false)}
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  testID="report-correct"
                  label={t("gotItRight")}
                  icon={<Ionicons name="checkmark-circle" size={18} color={colors.onBrandPrimary} />}
                  onPress={() => reportCorrect(true)}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  // ---- capture ----
  const renderPageThumbs = () =>
    pages.length > 0 ? (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pageStrip} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          {pages.map((p, i) => (
            <View key={i} style={styles.pageThumbWrap} testID={`page-thumb-${i}`}>
              {p.mime === "application/pdf" ? (
                <View style={[styles.pageThumb, { alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="document-text" size={22} color={colors.brand} />
                </View>
              ) : (
                <RNImage source={{ uri: `data:${p.mime};base64,${p.base64}` }} style={styles.pageThumb} />
              )}
              <View style={styles.pageThumbNum}><RText weight="heavy" style={styles.pageThumbNumText}>{i + 1}</RText></View>
              <Pressable testID={`remove-page-${i}`} onPress={() => removePage(i)} style={styles.pageThumbRemove} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.error} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <Field testID="capture-hint" value={hint} onChangeText={setHint} placeholder={t("studyCaptureHintField")} style={styles.hintField} />
      </>
    ) : null;

  const renderGenerateButton = () =>
    pages.length > 0 ? (
      <View style={[styles.generateBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton testID="generate-from-pages" label={`${t("studyGenerateCta")} · ${pages.length}`} onPress={generate} />
      </View>
    ) : null;

  const renderPermission = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.centered}>
        <PaperPlane size={48} />
        <RText weight="bold" style={{ color: colors.onSurface, fontSize: font.lg, textAlign: "center", marginTop: spacing.lg }}>
          {t("studyCameraPermission")}
        </RText>
        {permission?.canAskAgain !== false ? (
          <PrimaryButton testID="grant-camera" label={t("studyGrantPermission")} onPress={requestPermission} style={{ marginTop: spacing.xl, width: 240 }} />
        ) : (
          <PrimaryButton testID="open-settings" label={t("studyOpenSettings")} onPress={() => Linking.openSettings()} style={{ marginTop: spacing.xl, width: 240 }} />
        )}
        <Pressable onPress={pickGallery} style={{ marginTop: spacing.lg }}>
          <RText weight="bold" style={{ color: colors.brand }}>{t("studyCaptureGallery")}</RText>
        </Pressable>
        {error ? <RText testID="capture-error" style={{ color: colors.error, textAlign: "center", marginTop: spacing.md }}>{error}</RText> : null}
      </View>
      {renderPageThumbs()}
      {renderGenerateButton()}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="capture-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={colors.onSurfaceSecondary} />
        </Pressable>
        <RText weight="heavy" style={styles.modalTitle}>BoostBac</RText>
        <Pressable testID="pick-pdf" onPress={pickPdf} style={styles.iconBtn} disabled={pages.length > 0}>
          <Ionicons name="document-text-outline" size={20} color={pages.length > 0 ? colors.muted : colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      {!permission || !permission.granted ? (
        renderPermission()
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <View style={styles.frameGuide} pointerEvents="none" />
            <View style={styles.hintBadge} pointerEvents="none">
              <RText style={styles.hintBadgeText}>{pages.length === 0 ? t("studyCaptureHint") : t("studyCaptureMultiPage")}</RText>
            </View>
          </View>

          {renderPageThumbs()}
          {error ? <RText testID="capture-error" style={{ color: colors.error, textAlign: "center", marginTop: spacing.sm }}>{error}</RText> : null}

          <View style={[styles.captureBar, { paddingBottom: pages.length > 0 ? spacing.sm : insets.bottom + spacing.md }]}>
            <Pressable testID="pick-gallery" onPress={pickGallery} style={styles.galleryBtn}>
              <Ionicons name="images" size={24} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="take-photo" onPress={takePhoto} disabled={busy} style={[styles.shutter, glow(colors.brand, 16)]}>
              <View style={styles.shutterInner} />
            </Pressable>
            <View style={styles.galleryBtn} />
          </View>

          {renderGenerateButton()}
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
  sessionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  progressTrackWrap: { flex: 1, alignItems: "center" },
  progressLabel: { color: colors.onSurfaceSecondary, fontSize: font.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  cameraWrap: { flex: 1, margin: spacing.lg, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000" },
  frameGuide: { position: "absolute", top: 40, left: 24, right: 24, bottom: 40, borderWidth: 2, borderColor: colors.brand, borderRadius: radius.md, borderStyle: "dashed" },
  captureBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  galleryBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  shutter: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 62, height: 62, borderRadius: 31, borderWidth: 4, borderColor: colors.surface, backgroundColor: colors.brand },
  hintBadge: { position: "absolute", bottom: spacing.md, left: spacing.md, right: spacing.md, backgroundColor: "rgba(13,43,82,0.7)", borderRadius: radius.md, padding: spacing.sm },
  hintBadgeText: { color: "#fff", fontSize: font.sm, textAlign: "center" },
  pageStrip: { maxHeight: 84, marginTop: spacing.sm },
  pageThumbWrap: { width: 60, height: 60, borderRadius: radius.sm, overflow: "visible" },
  pageThumb: { width: 60, height: 60, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  pageThumbNum: { position: "absolute", bottom: 2, left: 2, backgroundColor: colors.brand, borderRadius: radius.pill, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  pageThumbNumText: { color: colors.onBrandPrimary, fontSize: 10 },
  pageThumbRemove: { position: "absolute", top: -8, right: -8, backgroundColor: colors.surface, borderRadius: 10 },
  hintField: { marginHorizontal: spacing.lg, marginTop: spacing.sm, height: 44 },
  generateBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  subjectTag: { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  qText: { color: colors.onSurface, fontSize: font.lg, lineHeight: 26 },
  aText: { color: colors.onSurface, fontSize: font.base, lineHeight: 24 },
  solutionTitle: { color: colors.onSurface, fontSize: font.lg },
  confidenceNote: { color: colors.muted, fontSize: font.sm, marginTop: spacing.sm, fontStyle: "italic" },
  contextLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  processingTitle: { color: colors.onSurface, fontSize: font.xl, textAlign: "center", marginTop: spacing.lg },
  processingBody: { color: colors.onSurfaceSecondary, fontSize: font.base, textAlign: "center", marginTop: spacing.sm, lineHeight: 22, maxWidth: 300 },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  hintText: { color: colors.onSurfaceSecondary, fontSize: font.sm, textAlign: "center" },
});
