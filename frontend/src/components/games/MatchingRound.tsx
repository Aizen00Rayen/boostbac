import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, font, softShadow } from "@/src/theme";
import { RText } from "@/src/components/ui";
import { useI18n } from "@/src/i18n";
import { GameCard, shuffle } from "./types";

type Tile = { card_id: string; text: string };

export function MatchingRound({
  cards,
  onComplete,
}: {
  cards: GameCard[];
  onComplete: (results: Record<string, boolean>) => void;
}) {
  const { t } = useI18n();
  const key = cards.map((c) => c.card_id).join(",");
  const prompts = useMemo<Tile[]>(
    () => shuffle(cards.map((c) => ({ card_id: c.card_id, text: c.game_data?.match_prompt ?? c.question }))),
    [key],
  );
  const answers = useMemo<Tile[]>(
    () => shuffle(cards.map((c) => ({ card_id: c.card_id, text: c.game_data?.match_answer ?? c.answer }))),
    [key],
  );

  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<{ prompt: string; answer: string } | null>(null);
  const [mistakes, setMistakes] = useState<Record<string, number>>({});

  const tapPrompt = (card_id: string) => {
    if (matched.has(card_id) || wrongFlash) return;
    setSelectedPrompt(card_id);
  };

  const tapAnswer = (card_id: string) => {
    if (!selectedPrompt || matched.has(card_id) || wrongFlash) return;
    if (card_id === selectedPrompt) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const next = new Set(matched);
      next.add(card_id);
      setMatched(next);
      setSelectedPrompt(null);
      if (next.size === cards.length) {
        const results: Record<string, boolean> = {};
        cards.forEach((c) => { results[c.card_id] = !mistakes[c.card_id]; });
        setTimeout(() => onComplete(results), 500);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMistakes((m) => ({ ...m, [selectedPrompt]: (m[selectedPrompt] || 0) + 1 }));
      setWrongFlash({ prompt: selectedPrompt, answer: card_id });
      setTimeout(() => {
        setWrongFlash(null);
        setSelectedPrompt(null);
      }, 500);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <RText weight="bold" style={styles.instruction}>{t("matchInstruction")}</RText>
      <View style={styles.row}>
        <View style={styles.col}>
          {prompts.map((p) => (
            <Pressable
              key={p.card_id}
              testID={`match-prompt-${p.card_id}`}
              onPress={() => tapPrompt(p.card_id)}
              style={[
                styles.tile,
                matched.has(p.card_id) && styles.tileMatched,
                selectedPrompt === p.card_id && styles.tileSelected,
                wrongFlash?.prompt === p.card_id && styles.tileWrong,
              ]}
            >
              <RText weight="medium" style={styles.tileText}>{p.text}</RText>
            </Pressable>
          ))}
        </View>
        <View style={styles.col}>
          {answers.map((a) => (
            <Pressable
              key={a.card_id}
              testID={`match-answer-${a.card_id}`}
              onPress={() => tapAnswer(a.card_id)}
              style={[
                styles.tile,
                matched.has(a.card_id) && styles.tileMatched,
                wrongFlash?.answer === a.card_id && styles.tileWrong,
              ]}
            >
              <RText weight="medium" style={styles.tileText}>{a.text}</RText>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  instruction: { color: colors.onSurfaceSecondary, fontSize: font.base, marginBottom: spacing.lg },
  row: { flexDirection: "row", gap: spacing.md },
  col: { flex: 1, gap: spacing.sm },
  tile: {
    minHeight: 56,
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    ...softShadow(0.05, 6),
  },
  tileText: { color: colors.onSurface, fontSize: font.base, textAlign: "center" },
  tileSelected: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  tileMatched: { borderColor: colors.success, backgroundColor: colors.brandTertiary, opacity: 0.6 },
  tileWrong: { borderColor: colors.error, backgroundColor: colors.errorTertiary },
});
