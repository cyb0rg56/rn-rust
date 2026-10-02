import {cliClient, toCliError} from './client';
import {appendLog} from '../store/logSlice';
import {store} from '../store/store';

export function reportError(error: unknown): void {
  const cliError = toCliError(error);
  const text = cliError.code ? `${cliError.code}: ${cliError.message}` : cliError.message;
  store.dispatch(appendLog({kind: 'error', text}));
  try {
    cliClient.log(text);
  } catch {
    // The native module is unavailable outside the Windows app. The log entry still stands.
  }
}
