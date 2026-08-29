import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { I18nProvider } from "@/src/i18n";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <KeyboardProvider>
        <I18nProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <View style={{ flex: 1, backgroundColor: colors.surface }}>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: "fade" }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="welcome" />
                <Stack.Screen name="login" />
                <Stack.Screen name="signup" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="admin" />
                <Stack.Screen name="capture" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
                <Stack.Screen name="review" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
                <Stack.Screen name="test" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
                <Stack.Screen name="test-session" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
                <Stack.Screen name="library" options={{ animation: "slide_from_right" }} />
                <Stack.Screen name="settings" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
              </Stack>
            </View>
          </AuthProvider>
        </I18nProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
