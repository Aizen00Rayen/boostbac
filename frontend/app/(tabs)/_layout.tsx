import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { useI18n } from "@/src/i18n";
import { colors } from "@/src/theme";
import { BadgeProvider } from "@/src/context/BadgeContext";

export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <BadgeProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.surfaceSecondary,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: Platform.OS === "ios" ? 88 : 66,
            paddingTop: 8,
            paddingBottom: Platform.OS === "ios" ? 28 : 10,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t("home"), tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="dashboard"
          options={{ title: t("dashboard"), tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="leaderboard"
          options={{ title: t("leaderboard"), tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="exams"
          options={{ title: t("exams"), tabBarIcon: ({ color, size }) => <Ionicons name="school" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: t("profile"), tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
        />
      </Tabs>
    </BadgeProvider>
  );
}
