import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font } from "@/src/theme";
import { RText, PrimaryButton, Card } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

export default function StudyTab() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={{ width: 40 }} />
        <RText weight="heavy" style={styles.wordmark}>BoostBac</RText>
        <Pressable testID="study-library" onPress={() => router.push("/library")} style={styles.iconBtn}>
          <Ionicons name="time-outline" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Card style={styles.card}>
          <PaperPlane size={64} />
          <RText weight="heavy" style={styles.title}>{t("tab_study")}</RText>
          <RText weight="regular" style={styles.subtitle}>{t("studyCaptureHint")}</RText>
          <PrimaryButton
            testID="study-capture-cta"
            label={t("homeZeroCta")}
            icon={<Ionicons name="camera" size={18} color={colors.onBrandPrimary} />}
            onPress={() => router.push("/capture")}
            style={{ marginTop: spacing.xl, width: "100%" }}
          />
        </Card>

        <Pressable testID="study-view-library" onPress={() => router.push("/library")} style={styles.libraryLink}>
          <Ionicons name="albums-outline" size={18} color={colors.brand} />
          <RText weight="bold" style={{ color: colors.brand }}>{t("libraryTitle")}</RText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  wordmark: { color: colors.onSurface, fontSize: font.lg },
  body: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  card: { alignItems: "center", padding: spacing["2xl"] },
  title: { color: colors.onSurface, fontSize: font.xl, marginTop: spacing.lg },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: font.base, textAlign: "center", marginTop: spacing.sm },
  libraryLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.xl, padding: spacing.md },
});
