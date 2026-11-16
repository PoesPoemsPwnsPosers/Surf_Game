import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { BASE_URL, BEFORE_LOAD, PAUSE, isGameUrl } from './src/bridge';

// The whole game as one HTML string. Made by "npm run build:mobile" in the repo root.
const gameHtml: string = require('./generated/gameHtml');

/**
 * The app is a full-screen web view that runs the same game as the web version, with its
 * on-screen touch controls switched on. Everything about the game itself lives in ../src.
 */
export default function App() {
  useKeepAwake();
  // WebView<{}>: the library's default type argument makes its props impossible to satisfy.
  const web = useRef<WebView<{}>>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Changing the key makes a fresh web view, which is how a crashed one is brought back.
  const [run, setRun] = useState(0);

  const pause = useCallback(() => web.current?.injectJavaScript(PAUSE), []);

  useEffect(() => {
    // app.json asks for landscape too; this covers Expo Go, which ignores that setting.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  useEffect(() => {
    // Pause when the app leaves the screen: a call, the home button, the app switcher.
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') pause();
    });
    return () => sub.remove();
  }, [pause]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // The Android back button pauses instead of closing the game in the middle of a wave.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      pause();
      return true;
    });
    return () => sub.remove();
  }, [pause]);

  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => isGameUrl(req.url), []);
  const restart = useCallback(() => {
    setFailed(null);
    setRun((n) => n + 1);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {failed ? (
        <View style={styles.failed}>
          <Text style={styles.failedTitle}>The game could not start</Text>
          <Text style={styles.failedText}>{failed}</Text>
          <Text style={styles.retry} onPress={restart}>
            Try again
          </Text>
        </View>
      ) : (
        <WebView
          key={run}
          ref={web}
          style={styles.web}
          source={{ html: gameHtml, baseUrl: BASE_URL }}
          originWhitelist={['*']}
          injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD}
          onShouldStartLoadWithRequest={onShouldStart}
          javaScriptEnabled
          // The save lives in the page's localStorage.
          domStorageEnabled
          // It is a game screen, not a page: no scrolling, bouncing, zooming or text scaling.
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          textZoom={100}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          allowsLinkPreview={false}
          androidLayerType="hardware"
          webviewDebuggingEnabled={__DEV__}
          onError={(e) => setFailed(e.nativeEvent.description || 'Unknown error')}
          // If the system kills the web view to free memory, start a fresh one.
          onRenderProcessGone={restart}
          onContentProcessDidTerminate={restart}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#8fd3ff' },
  web: { flex: 1, backgroundColor: '#8fd3ff' },
  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0d2b45' },
  failedTitle: { color: '#ffd23f', fontSize: 22, fontWeight: '900', marginBottom: 8 },
  failedText: { color: '#ffffff', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  retry: { color: '#0d2b45', backgroundColor: '#19b5c9', fontSize: 18, fontWeight: '900', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 14, overflow: 'hidden' },
});
