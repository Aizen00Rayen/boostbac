import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font } from "@/src/theme";
import { RText, PrimaryButton } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

export default function Welcome() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.brandTertiary, colors.surface]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.9 }}
      />
      <View style={{ height: insets.top + spacing.md }} />

      <View style={styles.hero}>
        <View style={styles.logoGlow}>
          <Image source={require("../assets/images/boostbac.png")} style={styles.logo} contentFit="contain" />
        </View>
        <RText weight="heavy" style={styles.wordmark}>BoostBac</RText>
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
  hero: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  logoGlow: {
    shadowColor: colors.brand,
    shadowOpacity: 0.7,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  logo: { width: 140, height: 160 },
  wordmark: { color: colors.onSurface, fontSize: font["3xl"], marginTop: spacing.sm, letterSpacing: 0.5 },
  tagline: { color: colors.onSurfaceSecondary, fontSize: font.lg, textAlign: "center" },
  bottom: { paddingHorizontal: spacing.lg, gap: spacing.md },
  loginLink: { paddingVertical: spacing.md },
});
