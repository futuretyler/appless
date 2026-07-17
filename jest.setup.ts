/**
 * Default mocks for native modules jest-expo can't load. Individual suites
 * that need different behavior re-declare jest.mock locally - a file-level
 * registration overrides these (telemetry's stored-id SecureStore, the
 * switcher's WebView call-tracker, the stream suites' scripted fetches).
 */
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("react-native-webview", () => ({ WebView: () => null }));
