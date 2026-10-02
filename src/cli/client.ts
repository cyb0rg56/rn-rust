import NativeCliBackend from '../specs/NativeCliBackend';

export class CliError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }
  if (error && typeof error === 'object') {
    const record = error as {code?: unknown; message?: unknown};
    if (typeof record.code === 'string') {
      const message = typeof record.message === 'string' ? record.message : record.code;
      return new CliError(record.code, message);
    }
  }
  if (error instanceof Error) {
    return new CliError('PROTOCOL', error.message);
  }
  return new CliError('PROTOCOL', String(error));
}

export const cliClient = {
  start(): Promise<void> {
    return NativeCliBackend.start().catch(error => {
      throw toCliError(error);
    });
  },

  stop(): Promise<void> {
    return NativeCliBackend.stop().catch(error => {
      throw toCliError(error);
    });
  },

  request(method: string, paramsJson: string): Promise<string> {
    return NativeCliBackend.request(method, paramsJson).catch(error => {
      throw toCliError(error);
    });
  },

  log(message: string): void {
    NativeCliBackend.log(message);
  },

  subscribe(handlers: {
    onNotification: (payload: string) => void;
    onStderr: (line: string) => void;
    onExit: (code: number) => void;
  }): () => void {
    const notification = NativeCliBackend.onNotification(handlers.onNotification);
    const stderr = NativeCliBackend.onStderr(handlers.onStderr);
    const exit = NativeCliBackend.onExit(handlers.onExit);
    return () => {
      notification.remove();
      stderr.remove();
      exit.remove();
    };
  },
};
