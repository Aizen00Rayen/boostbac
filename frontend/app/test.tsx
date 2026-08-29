import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Card, Chip } from "@/src/components/ui";
import { PaperPlaneLoader } from "@/src/components/graphics";

type Availability = {
  quick: { unlocked: boolean };
  subject: { unlocked: boolean; subjects: { subject: string; count: number }[] };
  weak_spots: { unlocked: boolean };
  mixed: { unlocked: boolean };
};

export default function TestModeSelection() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [avail, setAvail] = useState<Availability | null>(null);
  const [expandSubject, setExpandSubject] = useState(false);
  const [chosenSubject, setChosenSubject] = useState<string | null>(null);
  const [starting, setStarting] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api<Availability>("/tests/availability");
        setAvail(res);
      } catch {
        setAvail({ quick: { unlocked: false }, subject: { unlocked: false, subjects: [] }, weak_spots: { unlocked: false }, mixed: { unlocked: false } });
      }
    })();
  }, []);

  const start = async (mode: string, subject?: string) => {
    setError("");
    setStarting(mode);
    try {
      const res = await api<{ test_id: string; mode: string; questions: any[] }>("/tests", {
        method: "POST",
        body: { mode, subject },
        timeout: 60000,
      });
      router.replace({ pathname: "/test-session", params: { data: JSON.stringify(res) } });
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : t("errorGeneric"));
    } finally {
      setStarting("");
    }
  };

  if (!avail) {
    return <View style={styles.centered}><PaperPlaneLoader label={t("loading")} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="test-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <RText weight="heavy" style={styles.title}>{t("testTitle")}</RText>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Card testID="test-mode-quick" style={!avail.quick.unlocked && styles.locked}>
          <View style={styles.rowBetween}>
            <RText weight="bold" style={styles.cardTitle}>{t("testQuickTitle")}</RText>
            <View style={styles.miniBadge}><RText weight="bold" style={{ color: colors.onBrandPrimary, fontSize: font.sm }}>{t("testQuickBadge", { n: 10 })}</RText></View>
          </View>
          <PrimaryButton
            testID="start-quick"
            label={t("testStart")}
            disabled={!avail.quick.unlocked}
            loading={starting === "quick"}
            onPress={() => start("quick")}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <Card testID="test-mode-subject" style={!avail.subject.unlocked && styles.locked}>
          <RText weight="bold" style={styles.cardTitle}>{t("testSubjectTitle")}</RText>
          <RText style={styles.cardSub}>{t("testSubjectSub")}</RText>
          {avail.subject.unlocked && (
            <>
              <Pressable testID="expand-subject" onPress={() => setExpandSubject((s) => !s)} style={{ marginTop: spacing.sm }}>
                <RText weight="bold" style={{ color: colors.brand }}>{t("testChooseSubject")}</RText>
              </Pressable>
              {expandSubject && (
                <View style={styles.chipWrap}>
                  {avail.subject.subjects.map((s) => (
                    <Chip key={s.subject} label={s.subject} selected={chosenSubject === s.subject} onPress={() => setChosenSubject(s.subject)} />
                  ))}
                </View>
              )}
              <PrimaryButton
                testID="start-subject"
                label={t("testStart")}
                disabled={!chosenSubject}
                loading={starting === "subject"}
                onPress={() => chosenSubject && start("subject", chosenSubject)}
                style={{ marginTop: spacing.md }}
              />
            </>
          )}
        </Card>

        <Card testID="test-mode-weak" style={!avail.weak_spots.unlocked && styles.locked}>
          <RText weight="bold" style={styles.cardTitle}>{t("testWeakTitle")}</RText>
          {avail.weak_spots.unlocked ? (
            <PrimaryButton testID="start-weak" label={t("testStart")} loading={starting === "weak_spots"} onPress={() => start("weak_spots")} style={{ marginTop: spacing.md }} />
          ) : (
            <View style={styles.lockedBox}>
              <RText style={{ color: colors.onSurfaceSecondary, fontSize: font.sm, lineHeight: 20 }}>{t("testWeakLocked")}</RText>
            </View>
          )}
        </Card>

        <Card testID="test-mode-mixed" style={!avail.mixed.unlocked && styles.locked}>
          <RText weight="bold" style={styles.cardTitle}>{t("testMixedTitle")}</RText>
          <RText style={styles.cardSub}>{t("testMixedSub")}</RText>
          <PrimaryButton
            testID="start-mixed"
            label={t("testStart")}
            disabled={!avail.mixed.unlocked}
            loading={starting === "mixed"}
            onPress={() => start("mixed")}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        {error ? <RText style={{ color: colors.error, textAlign: "center" }}>{error}</RText> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: font.xl },
  cardTitle: { color: colors.onSurface, fontSize: font.lg },
  cardSub: { color: colors.onSurfaceSecondary, fontSize: font.sm, marginTop: 4 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  miniBadge: { backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  locked: { opacity: 0.85 },
  lockedBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
});
