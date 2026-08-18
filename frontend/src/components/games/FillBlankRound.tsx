import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { RText, Field, PrimaryButton } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { GameCard } from "./types";

export function FillBlankRound({ card, onAnswer }: { card: GameCard; onAnswer: (correct: boolean) => void }) {
  const { t } = useI18n();
  const sentence = card.game_data?.blank_sentence ?? "";
  const answer = (card.game_data?.blank_answer ?? "").trim();
  const [input, setInput] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const [before, after] = sentence.split("___");

  const check = () => {
    const correct = input.trim().toLowerCase() === answer.toLowerCase();
    setChecked(correct);
    Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setTimeout(() => onAnswer(correct), 1100);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <RText weight="bold" style={styles.instruction}>{t("blankInstruction")}</RText>
      <View style={styles.sentenceBox}>
        <RText weight="medium" style={styles.sentence}>
          {before}
          <RText weight="heavy" style={{ color: colors.brand }}>{input || "＿＿＿"}</RText>
          {after}
        </RText>
      </View>
      <Field
        testID="blank-input"
        value={input}
        onChangeText={setInput}
        editable={checked === null}
        placeholder={t("answer")}
        autoCapitalize="none"
        style={{ marginTop: spacing.lg }}
      />
      {checked === null ? (
        <PrimaryButton testID="blank-check" label={t("done")} onPress={check} disabled={!input.trim()} style={{ marginTop: spacing.lg }} />
      ) : (
        <View style={[styles.feedback, checked ? styles.feedbackCorrect : styles.feedbackWrong]}>
          <Ionicons name={checked ? "checkmark-circle" : "close-circle"} size={20} color={checked ? colors.success : colors.error} />
          <RText weight="bold" style={{ color: checked ? colors.success : colors.error }}>
            {checked ? t("correctAnswer") : `${t("wrongAnswer")}: ${answer}`}
          </RText>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  instruction: { color: colors.onSurfaceSecondary, fontSize: font.base, marginBottom: spacing.md },
  sentenceBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg },
  sentence: { color: colors.onSurface, fontSize: font.lg, lineHeight: 26 },
  feedback: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  feedbackCorrect: { backgroundColor: colors.brandTertiary },
  feedbackWrong: { backgroundColor: colors.errorTertiary },
});
