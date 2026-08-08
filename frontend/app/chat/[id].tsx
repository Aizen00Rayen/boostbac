import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/context/AuthContext";
import { useI18n } from "@/src/i18n";
import { colors, spacing, font, radius } from "@/src/theme";
import { RText } from "@/src/components/ui";

type Msg = { message_id: string; sender_id: string; sender_name: string; text: string; created_at: string };

export default function ChatThread() {
  const { t, isRTL } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [otherName, setOtherName] = useState<string>(name || "");
  const [text, setText] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ messages: Msg[]; other_name: string }>(`/chat/${id}/messages`);
      setMessages(res.messages);
      if (res.other_name) setOtherName(res.other_name);
    } catch {}
  }, [id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const send = async () => {
    const val = text.trim();
    if (!val) return;
    setText("");
    const optimistic: Msg = { message_id: "tmp" + Date.now(), sender_id: user!.user_id, sender_name: user!.name, text: val, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    try {
      await api(`/chat/${id}/messages`, { method: "POST", body: { text: val } });
      load();
    } catch {}
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="chat-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={colors.onSurfaceSecondary} />
        </Pressable>
        <View style={styles.avatar}><RText weight="heavy" style={{ color: colors.onBrandPrimary }}>{(otherName || "?").charAt(0).toUpperCase()}</RText></View>
        <RText weight="heavy" style={styles.name} numberOfLines={1}>{otherName}</RText>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }} showsVerticalScrollIndicator={false}>
          {messages.map((m) => {
            const mine = m.sender_id === user?.user_id;
            return (
              <View key={m.message_id} style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <RText style={{ color: mine ? colors.onBrandPrimary : colors.onSurface, fontSize: font.lg }}>{m.text}</RText>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder={t("typeMessage")}
            placeholderTextColor={colors.muted}
            style={[styles.input, { textAlign: isRTL ? "right" : "left" }]}
            multiline
          />
          <Pressable testID="chat-send" onPress={send} style={styles.sendBtn}>
            <Ionicons name="send" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  name: { color: colors.onSurface, fontSize: font.lg, flex: 1 },
  bubbleRow: { flexDirection: "row" },
  bubble: { maxWidth: "80%", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, minHeight: 48, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, color: colors.onSurface, fontSize: font.lg, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
