import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText, PrimaryButton, Field } from "@/src/components/ui";

export default function Login() {
  const { t } = useI18n();
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async () => {
    setErr("");
    if (!email.trim() || !password) {
      setErr(t("email") + " / " + t("password"));
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setErr("");
    setGLoading(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setGLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <Pressable testID="back-button" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurfaceSecondary} />
        </Pressable>

        <RText weight="heavy" style={styles.title}>
          {t("login")}
        </RText>
        <RText weight="regular" style={styles.subtitle}>
          {t("tagline")}
        </RText>

        <View style={styles.form}>
          <Field
            testID="login-email"
            placeholder={t("email")}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            testID="login-password"
            placeholder={t("password")}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {err ? (
            <RText testID="login-error" style={styles.err}>
              {err}
            </RText>
          ) : null}
          <PrimaryButton testID="login-submit" label={t("login")} onPress={onSubmit} loading={loading} />

          <View style={styles.divider}>
            <View style={styles.line} />
            <RText style={{ color: colors.muted }}>{t("or")}</RText>
            <View style={styles.line} />
          </View>

          <PrimaryButton
            testID="login-google"
            variant="secondary"
            label={t("continueGoogle")}
            onPress={onGoogle}
            loading={gLoading}
            icon={<Ionicons name="logo-google" size={20} color={colors.brand} />}
          />
        </View>

        <Pressable testID="go-signup" onPress={() => router.replace("/signup")} style={{ marginTop: spacing.xl }}>
          <RText weight="bold" style={{ color: colors.brand, textAlign: "center" }}>
            {t("noAccount")}
          </RText>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, flexGrow: 1 },
  back: { width: 44, height: 44, justifyContent: "center" },
  title: { fontSize: font["4xl"], color: colors.onSurface, marginTop: spacing.lg },
  subtitle: { fontSize: font.lg, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  form: { marginTop: spacing["2xl"], gap: spacing.md },
  err: { color: colors.error, fontSize: font.base },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.xs },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
});
