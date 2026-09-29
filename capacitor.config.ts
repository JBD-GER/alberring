import type { CapacitorConfig } from "@capacitor/cli";

const development = process.env.CAPACITOR_ENV === "development";

// Both configurations package the local frontend. No remote WebView URL is used.
const config: CapacitorConfig = {
  appId: development ? "de.alberring.connect.dev" : "de.alberring.connect",
  appName: development ? "Alberring Dev" : "Alberring",
  webDir: "dist-native",
  loggingBehavior: development ? "debug" : "none",
  server: {
    hostname: "localhost",
    androidScheme: "https",
    iosScheme: "capacitor",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: development,
    backgroundColor: "#ffffff",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#ffffff",
    scheme: "App",
  },
  plugins: {
    Keyboard: { resize: "native", resizeOnFullScreen: true },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
