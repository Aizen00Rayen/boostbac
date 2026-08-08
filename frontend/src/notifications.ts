import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

const REMINDER_ENABLED_KEY = "boostbac_reminders";
const REMINDER_HOUR = 18; // 6 PM

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getReminderEnabled(): Promise<boolean> {
  return (await storage.getItem<boolean>(REMINDER_ENABLED_KEY, false)) ?? false;
}

export async function requestPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted && settings.canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  return granted;
}

export async function enableReminder(title: string, body: string): Promise<boolean> {
  const granted = await requestPermission();
  if (!granted) return false;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Study Reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: 0,
    },
  });
  await storage.setItem(REMINDER_ENABLED_KEY, true);
  return true;
}

export async function disableReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await storage.setItem(REMINDER_ENABLED_KEY, false);
}
