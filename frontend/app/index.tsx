import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, font, spacing } from "@/src/theme";
import { RText } from "@/src/components/ui";
import { PaperPlaneLoader } from "@/src/components/graphics";

export default function Index() {
  const { user, loading } = useAuth();
  const { ready } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (loading || !ready) return;
    if (!user) {
      router.replace("/welcome");
    } else if (user.role === "admin") {
      router.replace("/admin");
    } else if (!user.onboarded) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)");
    }
  }, [user, loading, ready]);

  return (
    <View style={styles.container} testID="splash-screen">
      <Image source={require("../assets/images/boostbac.png")} style={styles.logo} contentFit="contain" />
      <RText weight="heavy" style={styles.wordmark}>BoostBac</RText>
      <View style={{ height: 40 }} />
      <PaperPlaneLoader size={40} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 24 },
  logo: { width: 120, height: 138 },
  wordmark: { color: colors.onSurface, fontSize: font["2xl"], marginTop: spacing.sm, letterSpacing: 0.5 },
});
