/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, TextInput} from 'react-native';
import {configureStore} from '@reduxjs/toolkit';
import {Provider} from 'react-redux';

import {reportError} from '../src/cli/reportError';
import NativeCliBackend from '../src/specs/NativeCliBackend';
import {TestScreen} from '../src/screens/TestScreen';
import logReducer from '../src/store/logSlice';
import sessionReducer from '../src/store/sessionSlice';

jest.mock('../src/cli/reportError', () => ({
  reportError: jest.fn(),
}));

type Listeners = {
  onNotification: (payload: string) => void;
  onStderr: (line: string) => void;
  onExit: (code: number) => void;
};

const listeners: Partial<Listeners> = {};

function asMock(fn: unknown): jest.Mock {
  return fn as jest.Mock;
}

function createStore() {
  return configureStore({
    reducer: {
      session: sessionReducer,
      log: logReducer,
    },
  });
}

function flatten(children: unknown): string {
  if (children == null || typeof children === 'boolean') {
    return '';
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(flatten).join('');
  }
  return '';
}

function visibleText(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(node => flatten(node.props.children));
}

async function renderScreen() {
  const store = createStore();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <Provider store={store}>
        <TestScreen />
      </Provider>,
    );
  });
  return {store, renderer: renderer!};
}

function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  renderer.root.findByProps({accessibilityLabel: label}).props.onPress();
}

beforeEach(() => {
  listeners.onNotification = undefined;
  listeners.onStderr = undefined;
  listeners.onExit = undefined;
  asMock(NativeCliBackend.onNotification).mockImplementation(handler => {
    listeners.onNotification = handler;
    return {remove: jest.fn()};
  });
  asMock(NativeCliBackend.onStderr).mockImplementation(handler => {
    listeners.onStderr = handler;
    return {remove: jest.fn()};
  });
  asMock(NativeCliBackend.onExit).mockImplementation(handler => {
    listeners.onExit = handler;
    return {remove: jest.fn()};
  });
});

test('start moves the session to running and enables stop', async () => {
  let resolveStart: () => void = () => {};
  asMock(NativeCliBackend.start).mockReturnValue(
    new Promise<void>(resolve => {
      resolveStart = resolve;
    }),
  );

  const {renderer} = await renderScreen();
  await ReactTestRenderer.act(() => {
    press(renderer, 'Start CLI');
  });

  expect(visibleText(renderer)).toContain('Starting');
  expect(
    renderer.root.findByProps({accessibilityLabel: 'Start CLI'}).props.disabled,
  ).toBe(true);

  await ReactTestRenderer.act(async () => {
    resolveStart();
  });

  expect(visibleText(renderer)).toContain('Running');
  expect(
    renderer.root.findByProps({accessibilityLabel: 'Stop CLI'}).props.disabled,
  ).toBe(false);
});

test('start failure shows the native error and reports it', async () => {
  asMock(NativeCliBackend.start).mockRejectedValueOnce({
    code: 'SPAWN_FAILED',
    message: 'rn-cli.exe was not found beside the app.',
  });

  const {renderer} = await renderScreen();
  await ReactTestRenderer.act(async () => {
    press(renderer, 'Start CLI');
  });

  expect(visibleText(renderer)).toContain(
    'Error — rn-cli.exe was not found beside the app.',
  );
  expect(reportError).toHaveBeenCalledWith(
    expect.objectContaining({
      code: 'SPAWN_FAILED',
      message: 'rn-cli.exe was not found beside the app.',
    }),
  );
});

test('stop returns the session to stopped', async () => {
  const {renderer} = await renderScreen();
  await ReactTestRenderer.act(async () => {
    press(renderer, 'Start CLI');
  });
  await ReactTestRenderer.act(async () => {
    press(renderer, 'Stop CLI');
  });

  expect(NativeCliBackend.stop).toHaveBeenCalled();
  expect(visibleText(renderer)).toContain('Stopped');
});

test('ping and echo append the request and the response', async () => {
  asMock(NativeCliBackend.request)
    .mockResolvedValueOnce('{"pong":true}')
    .mockResolvedValueOnce('{"text":"world"}');

  const {renderer} = await renderScreen();
  await ReactTestRenderer.act(() => {
    renderer.root.findByType(TextInput).props.onChangeText('world');
  });
  await ReactTestRenderer.act(async () => {
    press(renderer, 'Ping CLI');
  });
  await ReactTestRenderer.act(async () => {
    press(renderer, 'Echo CLI');
  });

  expect(NativeCliBackend.request).toHaveBeenNthCalledWith(1, 'ping', '{}');
  expect(NativeCliBackend.request).toHaveBeenNthCalledWith(
    2,
    'echo',
    JSON.stringify({text: 'world'}),
  );
  expect(visibleText(renderer)).toEqual(
    expect.arrayContaining([
      'request: ping {}',
      'response: {"pong":true}',
      'request: echo {"text":"world"}',
      'response: {"text":"world"}',
    ]),
  );
});

test('a rejected request shows the CLI error', async () => {
  asMock(NativeCliBackend.request).mockRejectedValueOnce({
    code: 'NOT_RUNNING',
    message: 'The CLI is not running.',
  });

  const {renderer} = await renderScreen();
  await ReactTestRenderer.act(async () => {
    press(renderer, 'Ping CLI');
  });

  expect(visibleText(renderer)).toContain('request: ping {}');
  expect(visibleText(renderer)).toContain('Error — The CLI is not running.');
  expect(reportError).toHaveBeenCalled();
});

test('notifications, stderr, and exit update the log', async () => {
  const {renderer} = await renderScreen();

  await ReactTestRenderer.act(() => {
    listeners.onNotification?.(
      '{"jsonrpc":"2.0","method":"ready","params":{}}',
    );
    listeners.onStderr?.('ignored inbound notification');
    listeners.onExit?.(0);
  });

  expect(visibleText(renderer)).toEqual(
    expect.arrayContaining([
      'notification: {"jsonrpc":"2.0","method":"ready","params":{}}',
      'stderr: ignored inbound notification',
      'exit: CLI exited with code 0',
      'Stopped',
    ]),
  );
});

test('a non-zero exit is an error', async () => {
  const {renderer} = await renderScreen();

  await ReactTestRenderer.act(() => {
    listeners.onExit?.(1);
  });

  expect(visibleText(renderer)).toContain('Error — CLI exited with code 1');
});

test('unmount removes the native subscriptions', async () => {
  const removeNotification = jest.fn();
  const removeStderr = jest.fn();
  const removeExit = jest.fn();
  asMock(NativeCliBackend.onNotification).mockReturnValue({
    remove: removeNotification,
  });
  asMock(NativeCliBackend.onStderr).mockReturnValue({remove: removeStderr});
  asMock(NativeCliBackend.onExit).mockReturnValue({remove: removeExit});

  const {renderer} = await renderScreen();
  await ReactTestRenderer.act(() => {
    renderer.unmount();
  });

  expect(removeNotification).toHaveBeenCalledTimes(1);
  expect(removeStderr).toHaveBeenCalledTimes(1);
  expect(removeExit).toHaveBeenCalledTimes(1);
});
