import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

export default function Welcome() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0F3B45", colors.surface]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.9 }}
      />
      <View style={[styles.top, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.langRow}>
          {(["ar", "fr"] as const).map((l) => (
            <Pressable
              key={l}
              testID={`lang-toggle-${l}`}
              onPress={() => setLang(l)}
              style={[styles.langChip, lang === l && styles.langChipActive]}
            >
              <RText weight="bold" style={{ color: lang === l ? colors.onBrandPrimary : colors.onSurfaceSecondary }}>
                {l === "ar" ? "العربية" : "Français"}
              </RText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.logoGlow}>
          <Image source={require("../assets/images/boostbac.png")} style={styles.logo} contentFit="contain" />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.lg }}>
          <PaperPlane size={22} />
          <RText weight="medium" style={styles.tagline}>
            {t("tagline")}
          </RText>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]}>
        <PrimaryButton testID="welcome-get-started" label={t("getStarted")} onPress={() => router.push("/signup")} />
        <Pressable testID="welcome-login" onPress={() => router.push("/login")} style={styles.loginLink}>
          <RText weight="bold" style={{ color: colors.brand, textAlign: "center" }}>
            {t("haveAccount")}
          </RText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  top: { paddingHorizontal: spacing.lg },
  langRow: { flexDirection: "row", gap: spacing.sm, alignSelf: "flex-end" },
  langChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  logoGlow: {
    shadowColor: colors.brand,
    shadowOpacity: 0.7,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  logo: { width: 300, height: 150 },
  tagline: { color: colors.onSurfaceSecondary, fontSize: font.lg, textAlign: "center" },
  bottom: { paddingHorizontal: spacing.lg, gap: spacing.md },
  loginLink: { paddingVertical: spacing.md },
});
