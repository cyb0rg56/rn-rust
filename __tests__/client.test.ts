import NativeCliBackend from '../src/specs/NativeCliBackend';
import {CliError, cliClient, toCliError} from '../src/cli/client';

function asMock(fn: unknown): jest.Mock {
  return fn as jest.Mock;
}

describe('toCliError', () => {
  test('keeps a CliError', () => {
    const error = new CliError('TIMEOUT', 'The request timed out.');
    expect(toCliError(error)).toBe(error);
  });

  test('reads code and message from a native rejection', () => {
    expect(
      toCliError({code: 'NOT_RUNNING', message: 'The CLI is not running.'}),
    ).toMatchObject({
      name: 'CliError',
      code: 'NOT_RUNNING',
      message: 'The CLI is not running.',
    });
  });

  test('uses the code when the native rejection has no message', () => {
    expect(toCliError({code: 'PROTOCOL'})).toMatchObject({
      code: 'PROTOCOL',
      message: 'PROTOCOL',
    });
  });

  test('wraps a plain Error as PROTOCOL', () => {
    expect(toCliError(new Error('bad json'))).toMatchObject({
      code: 'PROTOCOL',
      message: 'bad json',
    });
  });

  test('wraps a non-error value as PROTOCOL', () => {
    expect(toCliError('nope')).toMatchObject({
      code: 'PROTOCOL',
      message: 'nope',
    });
  });
});

describe('cliClient', () => {
  test('start, stop, and request resolve through the native module', async () => {
    asMock(NativeCliBackend.request).mockResolvedValueOnce('{"pong":true}');

    await expect(cliClient.start()).resolves.toBeUndefined();
    await expect(cliClient.stop()).resolves.toBeUndefined();
    await expect(cliClient.request('ping', '{}')).resolves.toBe(
      '{"pong":true}',
    );
    expect(NativeCliBackend.start).toHaveBeenCalledTimes(1);
    expect(NativeCliBackend.stop).toHaveBeenCalledTimes(1);
    expect(NativeCliBackend.request).toHaveBeenCalledWith('ping', '{}');
  });

  test('rejects with a CliError when the native module rejects', async () => {
    asMock(NativeCliBackend.request).mockRejectedValueOnce({
      code: 'EXITED',
      message: 'The CLI exited.',
    });

    await expect(cliClient.request('ping', '{}')).rejects.toMatchObject({
      name: 'CliError',
      code: 'EXITED',
      message: 'The CLI exited.',
    });
  });

  test('log forwards the message', () => {
    cliClient.log('SPAWN_FAILED: missing');
    expect(NativeCliBackend.log).toHaveBeenCalledWith('SPAWN_FAILED: missing');
  });

  test('subscribe removes every listener', () => {
    const removeNotification = jest.fn();
    const removeStderr = jest.fn();
    const removeExit = jest.fn();
    asMock(NativeCliBackend.onNotification).mockReturnValueOnce({
      remove: removeNotification,
    });
    asMock(NativeCliBackend.onStderr).mockReturnValueOnce({
      remove: removeStderr,
    });
    asMock(NativeCliBackend.onExit).mockReturnValueOnce({remove: removeExit});

    const unsubscribe = cliClient.subscribe({
      onNotification: jest.fn(),
      onStderr: jest.fn(),
      onExit: jest.fn(),
    });
    unsubscribe();

    expect(removeNotification).toHaveBeenCalledTimes(1);
    expect(removeStderr).toHaveBeenCalledTimes(1);
    expect(removeExit).toHaveBeenCalledTimes(1);
  });
});
