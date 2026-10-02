import logReducer, {appendLog} from '../src/store/logSlice';
import sessionReducer, {setError, setStatus} from '../src/store/sessionSlice';

describe('session', () => {
  test('starts idle with no error', () => {
    expect(sessionReducer(undefined, {type: 'init'})).toEqual({
      status: 'idle',
      lastError: null,
    });
  });

  test('setError records the message and setStatus clears it', () => {
    const failed = sessionReducer(
      undefined,
      setError('The CLI is not running.'),
    );
    expect(failed).toEqual({
      status: 'error',
      lastError: 'The CLI is not running.',
    });

    expect(sessionReducer(failed, setStatus('running'))).toEqual({
      status: 'running',
      lastError: null,
    });
  });
});

describe('log', () => {
  test('appends entries with increasing ids', () => {
    const first = logReducer(
      undefined,
      appendLog({kind: 'request', text: 'ping {}'}),
    );
    const second = logReducer(
      first,
      appendLog({kind: 'response', text: '{"pong":true}'}),
    );

    expect(second.entries).toEqual([
      {id: 1, kind: 'request', text: 'ping {}'},
      {id: 2, kind: 'response', text: '{"pong":true}'},
    ]);
    expect(second.nextId).toBe(3);
  });

  test('keeps the newest 200 entries', () => {
    let state = logReducer(undefined, {type: 'init'});
    for (let index = 0; index < 201; index += 1) {
      state = logReducer(
        state,
        appendLog({kind: 'stderr', text: String(index)}),
      );
    }

    expect(state.entries).toHaveLength(200);
    expect(state.entries[0]).toMatchObject({id: 2, text: '1'});
    expect(state.entries[199]).toMatchObject({id: 201, text: '200'});
  });
});
