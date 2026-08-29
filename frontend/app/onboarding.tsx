import { useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font } from "@/src/theme";
import { RText, PrimaryButton, Field, OptionRow } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

const STREAMS = ["math", "science", "tech", "management", "letters", "languages"] as const;
const TIME_PREFS = ["morning", "night", "flexible"] as const;
const PAIN_POINTS = ["forget", "start", "avoid", "repeat", "consistency"] as const;
const PAIN_POINT_KEY: Record<string, string> = {
  forget: "forget_what_i_study",
  start: "dont_know_where_to_start",
  avoid: "avoid_hard_subjects",
  repeat: "repeat_mistakes",
  consistency: "no_consistency",
};
const GOALS = ["remembering", "understanding", "consistency", "confidence"] as const;

const TOTAL_STEPS = 6;

export default function Onboarding() {
  const { t } = useI18n();
  const { completeOnboarding } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState("");
  const [stream, setStream] = useState<string>("science");
  const [timePref, setTimePref] = useState<string>("");
  const [pains, setPains] = useState<string[]>([]);
  const [goal, setGoal] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const togglePain = (p: string) => setPains((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const canAdvance = () => {
    if (step === 2) return !!stream;
    if (step === 3) return !!timePref;
    if (step === 5) return !!goal;
    return true;
  };

  const finish = async () => {
    setLoading(true);
    try {
      await completeOnboarding({
        nickname: nickname.trim() || undefined,
        stream,
        study_time_pref: timePref,
        pain_points: pains.map((p) => PAIN_POINT_KEY[p]),
        goal,
      });
      router.replace("/(tabs)");
    } finally {
      setLoading(false);
    }
  };

  const next = () => {
    if (step === TOTAL_STEPS - 1) {
      finish();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {step > 0 ? (
          <Pressable testID="onboard-back" onPress={() => setStep((s) => s - 1)} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content} bottomOffset={40} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View style={styles.centered}>
            <PaperPlane size={110} />
            <RText weight="heavy" style={styles.title}>{t("onboardHeyTitle")}</RText>
            <RText weight="regular" style={styles.subtitleCenter}>{t("onboardHeySubtitle")}</RText>
          </View>
        )}

        {step === 1 && (
          <View>
            <RText weight="heavy" style={styles.title}>{t("onboardNameTitle")}</RText>
            <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
              <Field testID="onboard-nickname" placeholder={t("onboardNicknamePlaceholder")} value={nickname} onChangeText={setNickname} />
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <RText weight="heavy" style={styles.title}>{t("onboardStreamTitle")}</RText>
            <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
              {STREAMS.map((s) => (
                <OptionRow key={s} testID={`onboard-stream-${s}`} label={t(`stream_${s}`)} selected={stream === s} onPress={() => setStream(s)} />
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <RText weight="heavy" style={styles.title}>{t("onboardTimeTitle")}</RText>
            <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
              {TIME_PREFS.map((p) => (
                <OptionRow key={p} testID={`onboard-time-${p}`} label={t(`timePref_${p}`)} selected={timePref === p} onPress={() => setTimePref(p)} />
              ))}
            </View>
          </View>
        )}

        {step === 4 && (
          <View>
            <RText weight="heavy" style={styles.title}>{t("onboardPainTitle")}</RText>
            <RText weight="regular" style={styles.subtitle}>{t("onboardPainSubtitle")}</RText>
            <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
              {PAIN_POINTS.map((p) => (
                <OptionRow key={p} testID={`onboard-pain-${p}`} label={t(`pain_${p}`)} selected={pains.includes(p)} onPress={() => togglePain(p)} />
              ))}
            </View>
          </View>
        )}

        {step === 5 && (
          <View>
            <RText weight="heavy" style={styles.title}>{t("onboardGoalTitle")}</RText>
            <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
              {GOALS.map((g) => (
                <OptionRow key={g} testID={`onboard-goal-${g}`} label={t(`goal_${g}`)} selected={goal === g} onPress={() => setGoal(g)} />
              ))}
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <PrimaryButton
          testID="onboard-next"
          label={step === 0 ? t("onboardStart") : step === TOTAL_STEPS - 1 ? t("onboardFinish") : t("next")}
          onPress={next}
          disabled={!canAdvance()}
          loading={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brand, width: 18 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, flexGrow: 1 },
  centered: { alignItems: "center", paddingTop: spacing["2xl"] },
  title: { fontSize: font["2xl"], color: colors.onSurface },
  subtitle: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  subtitleCenter: { fontSize: font.lg, color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
