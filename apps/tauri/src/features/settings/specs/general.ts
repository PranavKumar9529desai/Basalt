import type { SettingItemSpec } from "../types";

/**
 * General options specs (ADR-037 §7.A / spec §5.1).
 *
 * Account and license buttons are design placeholders — cloud auth/sync
 * infrastructure is deferred (ADR-037 non-goals); update checking is
 * likewise not wired to a server yet.
 */
const deferred = (what: string) => () => {
  console.info(`[settings] "${what}" is not wired yet (deferred infra).`);
};

export const APP_VERSION = "0.1.0";

export const GENERAL_SPECS: SettingItemSpec[] = [
  {
    name: `Version ${APP_VERSION}`,
    description: `Installer version: ${APP_VERSION}. Read the changelog.`,
    type: "button",
    button: { text: "Check for updates", onClick: deferred("Check for updates") },
  },
  {
    key: "autoUpdates",
    name: "Automatic updates",
    description: "Turn this off to prevent the app from checking for updates.",
    type: "toggle",
    keywords: ["update", "autoupdate", "check"],
  },
  {
    key: "earlyAccess",
    name: "Receive early access versions",
    description: "Auto-update to the latest early access version.",
    type: "toggle",
    keywords: ["beta", "update"],
  },
  {
    key: "language",
    name: "Language",
    description: "Change the display language.",
    type: "dropdown",
    options: [{ label: "English", value: "en" }],
  },
  {
    name: "Help",
    description: "Learn how to use Basalt and get help from the community.",
    type: "button",
    button: { text: "Open", onClick: deferred("Help") },
    keywords: ["docs", "documentation", "community"],
  },
  {
    heading: "Account",
    name: "Your account",
    description:
      "You are not logged in right now. An account is only needed for sync and publish.",
    type: "button-group",
    buttons: [
      { text: "Log in", onClick: deferred("Log in") },
      { text: "Sign up", variant: "default", onClick: deferred("Sign up") },
    ],
    keywords: ["sync", "publish", "login"],
  },
  {
    heading: "Commercial license",
    name: "Commercial license",
    description: "Help keep Basalt 100% user-supported.",
    type: "button-group",
    buttons: [
      { text: "Activate", onClick: deferred("Activate license") },
      { text: "Purchase", variant: "default", onClick: deferred("Purchase") },
    ],
    keywords: ["license", "pro", "support"],
  },
];