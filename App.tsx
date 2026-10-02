import React from 'react';
import {StatusBar, StyleSheet, useColorScheme, View} from 'react-native';
import {Provider} from 'react-redux';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';

import {ErrorBoundary} from './src/components/ErrorBoundary';
import {TestScreen} from './src/screens/TestScreen';
import {store} from './src/store/store';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </SafeAreaProvider>
    </Provider>
  );
}

function AppContent(): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
      <TestScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
