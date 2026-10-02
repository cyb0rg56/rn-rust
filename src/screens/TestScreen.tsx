import React, {useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';

import {cliClient} from '../cli/client';
import {reportError} from '../cli/reportError';
import type {LogEntry} from '../store/logSlice';
import {appendLog} from '../store/logSlice';
import {setError, setStatus} from '../store/sessionSlice';
import type {RootState} from '../store/store';

function statusLabel(status: RootState['session']['status']): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'starting':
      return 'Starting';
    case 'running':
      return 'Running';
    case 'stopped':
      return 'Stopped';
    case 'error':
      return 'Error';
  }
}

export function TestScreen(): React.JSX.Element {
  const dispatch = useDispatch();
  const status = useSelector((state: RootState) => state.session.status);
  const lastError = useSelector((state: RootState) => state.session.lastError);
  const entries = useSelector((state: RootState) => state.log.entries);
  const [echoText, setEchoText] = useState('hello');
  const busy = status === 'starting';
  const running = status === 'running';

  React.useEffect(() => {
    return cliClient.subscribe({
      onNotification(payload) {
        dispatch(appendLog({kind: 'notification', text: payload}));
      },
      onStderr(line) {
        dispatch(appendLog({kind: 'stderr', text: line}));
      },
      onExit(code) {
        dispatch(appendLog({kind: 'exit', text: `CLI exited with code ${code}`}));
        if (code === 0) {
          dispatch(setStatus('stopped'));
        } else {
          dispatch(setError(`CLI exited with code ${code}`));
        }
      },
    });
  }, [dispatch]);

  async function onStart(): Promise<void> {
    dispatch(setStatus('starting'));
    try {
      await cliClient.start();
      dispatch(setStatus('running'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch(setError(message));
      reportError(error);
    }
  }

  async function onStop(): Promise<void> {
    try {
      await cliClient.stop();
      dispatch(setStatus('stopped'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch(setError(message));
      reportError(error);
    }
  }

  async function send(method: string, paramsJson: string): Promise<void> {
    dispatch(appendLog({kind: 'request', text: `${method} ${paramsJson}`}));
    try {
      const result = await cliClient.request(method, paramsJson);
      dispatch(appendLog({kind: 'response', text: result}));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch(setError(message));
      reportError(error);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Rust CLI</Text>
      <Text style={styles.status}>
        {statusLabel(status)}
        {lastError ? ` — ${lastError}` : ''}
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel="Start CLI"
          style={[styles.button, busy ? styles.buttonDisabled : null]}
          disabled={busy}
          onPress={() => {
            onStart().catch(reportError);
          }}>
          <Text style={styles.buttonText}>Start</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Stop CLI"
          style={[styles.button, !running ? styles.buttonDisabled : null]}
          disabled={!running}
          onPress={() => {
            onStop().catch(reportError);
          }}>
          <Text style={styles.buttonText}>Stop</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Ping CLI"
          style={styles.button}
          onPress={() => {
            send('ping', '{}').catch(reportError);
          }}>
          <Text style={styles.buttonText}>Ping</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
        value={echoText}
        onChangeText={setEchoText}
        placeholder="Echo text"
        placeholderTextColor="#8a8478"
      />
      <Pressable
        accessibilityLabel="Echo CLI"
        style={[styles.button, styles.echoButton]}
        onPress={() => {
          send('echo', JSON.stringify({text: echoText})).catch(reportError);
        }}>
        <Text style={styles.buttonText}>Echo</Text>
      </Pressable>
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {entries.map((entry: LogEntry) => (
          <Text key={entry.id} style={styles.logLine}>
            {entry.kind}: {entry.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f1ea',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1d1a16',
  },
  status: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 16,
    color: '#4d463c',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    backgroundColor: '#1d1a16',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  echoButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#f4f1ea',
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#c8c0b4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1d1a16',
    backgroundColor: '#fffdf8',
  },
  log: {
    flex: 1,
    marginTop: 16,
    backgroundColor: '#fffdf8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8c0b4',
  },
  logContent: {
    padding: 12,
  },
  logLine: {
    fontSize: 13,
    color: '#1d1a16',
    marginBottom: 6,
  },
});
