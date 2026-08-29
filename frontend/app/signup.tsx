import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { ApiError, localizeError } from "@/src/api";
import { colors, spacing, font } from "@/src/theme";
import { RText, PrimaryButton, Field } from "@/src/components/ui";

export default function Signup() {
  const { t } = useI18n();
  const { register } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async () => {
    setErr("");
    if (!name.trim() || !email.trim() || password.length < 4) {
      setErr(t("fillRequired"));
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      router.replace("/onboarding");
    } catch (e: any) {
      setErr(e instanceof ApiError && e.status === 409 ? t("errorEmailTaken") : localizeError(e, t));
    } finally {
      setLoading(false);
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
          {t("signup")}
        </RText>
        <RText weight="regular" style={styles.subtitle}>
          {t("tagline")}
        </RText>

        <View style={styles.form}>
          <Field testID="signup-name" placeholder={t("name")} value={name} onChangeText={setName} />
          <Field
            testID="signup-email"
            placeholder={t("email")}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field testID="signup-password" placeholder={t("password")} secureTextEntry value={password} onChangeText={setPassword} />

          {err ? (
            <RText testID="signup-error" style={styles.err}>
              {err}
            </RText>
          ) : null}
          <PrimaryButton testID="signup-submit" label={t("signup")} onPress={onSubmit} loading={loading} />
        </View>

        <Pressable testID="go-login" onPress={() => router.replace("/login")} style={{ marginTop: spacing.xl }}>
          <RText weight="bold" style={{ color: colors.brand, textAlign: "center" }}>
            {t("haveAccount")}
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
});
