import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {reportError} from '../cli/reportError';

type Props = {
  children: React.ReactNode;
};

type State = {
  message: string | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {message: null};

  static getDerivedStateFromError(error: Error): State {
    return {message: error.message};
  }

  componentDidCatch(error: Error): void {
    reportError(error);
  }

  render(): React.ReactNode {
    if (this.state.message) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.title}>The UI hit an error</Text>
          <Text style={styles.message}>{this.state.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: '#f4f1ea',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1d1a16',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#4d463c',
  },
});
