import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from "react";
import { View, StyleSheet, Modal, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, withRepeat, Easing, interpolate } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius, glow } from "@/src/theme";
import { RText, PrimaryButton } from "@/src/components/ui";
import { PaperPlane } from "@/src/components/graphics";

type Badge = { id: string; icon: string; earned: boolean };
const STORE_KEY = "boostbac_earned_badges";

type Ctx = { refresh: () => Promise<void> };
const BadgeContext = createContext<Ctx>({ refresh: async () => {} });

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const initialized = useRef(false);
  const [queue, setQueue] = useState<string[]>([]);
  const current = queue[0] ?? null;

  const refresh = useCallback(async () => {
    let data: { badges: Badge[] };
    try {
      data = await api<{ badges: Badge[] }>("/badges");
    } catch {
      return;
    }
    const earned = data.badges.filter((b) => b.earned).map((b) => b.id);
    const rawStored = (await storage.getItem<string>(STORE_KEY, "")) ?? "";
    if (rawStored === "") {
      // first ever load — seed silently, do not celebrate existing badges
      await storage.setItem(STORE_KEY, JSON.stringify(earned));
      initialized.current = true;
      return;
    }
    let stored: string[] = [];
    try {
      stored = JSON.parse(rawStored);
    } catch {}
    const newly = earned.filter((id) => !stored.includes(id));
    if (newly.length > 0) {
      await storage.setItem(STORE_KEY, JSON.stringify(earned));
      setQueue((q) => [...q, ...newly]);
    }
  }, []);

  const dismiss = () => setQueue((q) => q.slice(1));

  return (
    <BadgeContext.Provider value={{ refresh }}>
      {children}
      {current && <Celebration badgeId={current} title={t(`badge_${current}`)} onDismiss={dismiss} />}
    </BadgeContext.Provider>
  );
}

function Celebration({ badgeId, title, onDismiss }: { badgeId: string; title: string; onDismiss: () => void }) {
  const { t } = useI18n();
  const scale = useSharedValue(0);
  const fly = useSharedValue(0);
  const glowPulse = useSharedValue(0);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.value = withSequence(withTiming(1.15, { duration: 320, easing: Easing.out(Easing.back(2)) }), withTiming(1, { duration: 180 }));
    fly.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, false);
    glowPulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
  }, [badgeId]);

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: interpolate(glowPulse.value, [0, 1], [0.4, 0.9]) }));
  const planeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(fly.value, [0, 1], [-160, 180]) },
      { translateY: interpolate(fly.value, [0, 0.5, 1], [30, -50, -140]) },
      { rotate: `${interpolate(fly.value, [0, 1], [-12, 18])}deg` },
    ],
    opacity: interpolate(fly.value, [0, 0.1, 0.85, 1], [0, 1, 1, 0]),
  }));

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.backdrop} testID="badge-celebration">
        <Animated.View style={[styles.flyPlane, planeStyle]} pointerEvents="none">
          <PaperPlane size={40} color={colors.brand} />
        </Animated.View>
        <RText weight="heavy" style={styles.unlockTitle}>{t("badgeUnlocked")}</RText>
        <Animated.View style={[styles.badgeBig, badgeStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.badgeGlow, glowStyle]} />
          <LinearGradient colors={[colors.brand, colors.brandSecondary]} style={StyleSheet.absoluteFill} />
          <Ionicons name={iconFor(badgeId) as any} size={56} color={colors.onBrandPrimary} />
        </Animated.View>
        <RText weight="heavy" style={styles.badgeName}>{title}</RText>
        <PrimaryButton testID="badge-dismiss" label={t("done")} onPress={onDismiss} style={{ width: 220, marginTop: spacing["2xl"] }} />
      </View>
    </Modal>
  );
}

function iconFor(id: string): string {
  if (id.startsWith("streak")) return "flame";
  if (id.startsWith("reviews")) return "repeat";
  if (id === "mastered_100") return "trophy";
  if (id.startsWith("mastered")) return "ribbon";
  if (id === "xp_500") return "flash";
  return "documents";
}

export const useBadges = () => useContext(BadgeContext);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,20,32,0.95)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  flyPlane: { position: "absolute", top: "28%" },
  unlockTitle: { color: colors.onSurfaceSecondary, fontSize: font.xl, marginBottom: spacing.xl },
  badgeBig: { width: 130, height: 130, borderRadius: 65, alignItems: "center", justifyContent: "center", overflow: "hidden", ...glow(colors.brand, 30) },
  badgeGlow: { backgroundColor: colors.brand, borderRadius: 65 },
  badgeName: { color: colors.onSurface, fontSize: font["2xl"], marginTop: spacing.xl, textAlign: "center" },
});
