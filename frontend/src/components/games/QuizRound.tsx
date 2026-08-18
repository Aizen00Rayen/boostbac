import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, softShadow } from "@/src/theme";
import { RText } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { formatExerciseText } from "@/src/utils/formatText";
import { GameCard, shuffle } from "./types";

export function QuizRound({ card, onAnswer }: { card: GameCard; onAnswer: (correct: boolean) => void }) {
  const { t, isRTL } = useI18n();
  const questionText = formatExerciseText(card.question);
  const correctIndex = card.game_data?.quiz_correct_index ?? 0;
  const rawOptions = card.game_data?.quiz_options ?? [];
  const options = useMemo(
    () => shuffle(rawOptions.map((text, i) => ({ text, isCorrect: i === correctIndex }))),
    [card.card_id],
  );
  const [selected, setSelected] = useState<number | null>(null);

  const select = (i: number) => {
    if (selected !== null) return;
    setSelected(i);
    const correct = options[i].isCorrect;
    Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setTimeout(() => onAnswer(correct), 750);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <RText weight="bold" style={styles.instruction}>{t("quizInstruction")}</RText>
      <RText
        weight="medium"
        style={[styles.question, { textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}
      >
        {questionText}
      </RText>
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {options.map((opt, i) => {
          const isSelected = selected === i;
          const revealCorrect = selected !== null && opt.isCorrect;
          const revealWrong = isSelected && !opt.isCorrect;
          return (
            <Pressable
              key={i}
              testID={`quiz-option-${i}`}
              onPress={() => select(i)}
              style={[
                styles.option,
                revealCorrect && styles.optionCorrect,
                revealWrong && styles.optionWrong,
              ]}
            >
              <RText weight="medium" style={styles.optionText}>{opt.text}</RText>
              {revealCorrect && <Ionicons name="checkmark-circle" size={22} color={colors.success} />}
              {revealWrong && <Ionicons name="close-circle" size={22} color={colors.error} />}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  instruction: { color: colors.onSurfaceSecondary, fontSize: font.base, marginBottom: spacing.sm },
  question: { color: colors.onSurface, fontSize: font.lg, lineHeight: 24 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    ...softShadow(0.05, 6),
  },
  optionText: { color: colors.onSurface, fontSize: font.lg, flex: 1 },
  optionCorrect: { borderColor: colors.success, backgroundColor: colors.brandTertiary },
  optionWrong: { borderColor: colors.error, backgroundColor: colors.errorTertiary },
});
