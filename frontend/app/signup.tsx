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

const STREAMS = ["math", "science", "tech", "management", "letters", "languages"] as const;

export default function Signup() {
  const { t } = useI18n();
  const { register } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stream, setStream] = useState<string>("science");
  const [role, setRole] = useState<string>("student");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async () => {
    setErr("");
    if (!name.trim() || !email.trim() || password.length < 4) {
      setErr(t("name") + " / " + t("email") + " / " + t("password"));
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, stream, role);
      router.replace(role === "teacher" ? "/pending" : "/(tabs)");
    } catch (e: any) {
      setErr(e?.message || "Error");
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
          <View style={styles.roleRow}>
            {(["student", "teacher"] as const).map((r) => (
              <Pressable key={r} testID={`role-${r}`} onPress={() => setRole(r)} style={[styles.roleChip, role === r && styles.streamChipActive]}>
                <Ionicons name={r === "student" ? "school-outline" : "person-outline"} size={18} color={role === r ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                <RText weight="bold" style={{ color: role === r ? colors.onBrandPrimary : colors.onSurfaceSecondary }}>
                  {t(r === "student" ? "iAmStudent" : "iAmTeacher")}
                </RText>
              </Pressable>
            ))}
          </View>
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

          <RText weight="bold" style={styles.label}>
            {t("stream")}
          </RText>
          <View style={styles.streamWrap}>
            {STREAMS.map((s) => (
              <Pressable
                key={s}
                testID={`stream-${s}`}
                onPress={() => setStream(s)}
                style={[styles.streamChip, stream === s && styles.streamChipActive]}
              >
                <RText weight="medium" style={{ color: stream === s ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontSize: font.base }}>
                  {t(`stream_${s}`)}
                </RText>
              </Pressable>
            ))}
          </View>

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
  form: { marginTop: spacing.xl, gap: spacing.md },
  roleRow: { flexDirection: "row", gap: spacing.md },
  roleChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.onSurface, fontSize: font.lg, marginTop: spacing.sm },
  streamWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  streamChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streamChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  err: { color: colors.error, fontSize: font.base },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.xs },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
});
