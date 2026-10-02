import NativeCliBackend from '../src/specs/NativeCliBackend';
import {CliError} from '../src/cli/client';
import {reportError} from '../src/cli/reportError';
import {store} from '../src/store/store';

function asMock(fn: unknown): jest.Mock {
  return fn as jest.Mock;
}

test('writes the code and message to the log and the native logger', () => {
  const before = store.getState().log.entries.length;

  reportError(
    new CliError('SPAWN_FAILED', 'rn-cli.exe was not found beside the app.'),
  );

  const entries = store.getState().log.entries;
  expect(entries).toHaveLength(before + 1);
  expect(entries[entries.length - 1]).toMatchObject({
    kind: 'error',
    text: 'SPAWN_FAILED: rn-cli.exe was not found beside the app.',
  });
  expect(NativeCliBackend.log).toHaveBeenCalledWith(
    'SPAWN_FAILED: rn-cli.exe was not found beside the app.',
  );
});

test('keeps the log entry when the native logger is unavailable', () => {
  asMock(NativeCliBackend.log).mockImplementationOnce(() => {
    throw new Error('CliBackend is unavailable');
  });
  const before = store.getState().log.entries.length;

  expect(() => reportError(new Error('render failed'))).not.toThrow();

  expect(store.getState().log.entries).toHaveLength(before + 1);
  expect(store.getState().log.entries.at(-1)).toMatchObject({
    kind: 'error',
    text: 'PROTOCOL: render failed',
  });
});
