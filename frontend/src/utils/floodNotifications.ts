import type { Prediction } from "../types";

const SHOWN_NOTIFICATION_PREFIX = "flood-alert-notified";
const SUBSCRIPTION_STORAGE_KEY = "flood-alert-push-subscription";

type NotificationState = "unsupported" | "default" | "denied" | "granted";
type AlertConfig = {
  alertTypes: Array<"flood" | "fire">;
  threshold: "Low" | "Medium" | "High";
};

const getNotificationTag = (alert: Prediction) => `${SHOWN_NOTIFICATION_PREFIX}:${alert.region_id}:${alert.date}`;

const getServiceWorkerUrl = () => `${import.meta.env.BASE_URL}sw.js`;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

export const getNotificationState = (): NotificationState => {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
};

export const registerFloodAlertServiceWorker = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register(getServiceWorkerUrl());
};

export const requestFloodNotificationPermission = async (config: AlertConfig) => {
  if (getNotificationState() === "unsupported") return "unsupported" as const;

  const registration = await registerFloodAlertServiceWorker();
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted" || !registration || !("PushManager" in window)) return permission;

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  const subscriptionEndpoint = import.meta.env.VITE_PUSH_SUBSCRIBE_ENDPOINT || `${window.location.origin}/api/push-subscriptions`;
  if (!vapidPublicKey || !subscriptionEndpoint) return permission;

  try {
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      }));

    window.localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscription));

    await fetch(subscriptionEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        alertTypes: config.alertTypes,
        threshold: config.threshold
      })
    });
  } catch (error) {
    console.warn("Flood alert push subscription was not saved.", error);
  }

  return permission;
};

export const notifyHighRiskDatasetUpdate = async (alert: Prediction) => {
  if (getNotificationState() !== "granted") return;

  const tag = getNotificationTag(alert);
  if (window.localStorage.getItem(tag)) return;

  const registration = await registerFloodAlertServiceWorker();
  await registration?.showNotification("High flood-risk dataset update", {
    body: `${alert.region_name}: ${Math.round(alert.risk_score * 100)}% risk, ${alert.rainfall_7d} mm rain.`,
    data: {
      regionId: alert.region_id,
      url: `${window.location.origin}${import.meta.env.BASE_URL}`
    },
    tag
  });
  window.localStorage.setItem(tag, "shown");
};

export const sendTestDatasetUpdatePush = async (alert: Prediction, previousRiskLevel = "Low") => {
  const endpoint = import.meta.env.VITE_TEST_RISK_ALERT_ENDPOINT || `${window.location.origin}/api/test-risk-alert`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "trigger-high-risk",
      alertType: "flood",
      previousRiskLevel,
      prediction: alert
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to send test push notification.");
  }

  const result = await response.json();
  return {
    ...result,
    ...(result.push || {})
  };
};

export const sendTestDatasetReset = async (alert: Prediction) => {
  const endpoint = import.meta.env.VITE_TEST_RISK_ALERT_ENDPOINT || `${window.location.origin}/api/test-risk-alert`;
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "reverse-high-risk",
      alertType: "flood",
      prediction: alert
    })
  }).catch((error) => {
    console.warn("Test risk reset did not reach the backend.", error);
  });
};
