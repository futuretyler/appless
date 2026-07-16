import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import GenOS from "./src/genos/GenOS";
import { initTelemetry } from "./src/genos/telemetry";

export default function App() {
  useEffect(() => {
    initTelemetry();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <GenOS />
    </SafeAreaProvider>
  );
}
