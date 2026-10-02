import type {PayloadAction} from '@reduxjs/toolkit';
import {createSlice} from '@reduxjs/toolkit';

export type LogKind = 'request' | 'response' | 'stderr' | 'exit' | 'error' | 'notification';

export type LogEntry = {
  id: number;
  kind: LogKind;
  text: string;
};

const maxEntries = 200;

type LogState = {
  nextId: number;
  entries: LogEntry[];
};

const initialState: LogState = {
  nextId: 1,
  entries: [],
};

const logSlice = createSlice({
  name: 'log',
  initialState,
  reducers: {
    appendLog(state, action: PayloadAction<{kind: LogKind; text: string}>) {
      state.entries.push({
        id: state.nextId,
        kind: action.payload.kind,
        text: action.payload.text,
      });
      state.nextId += 1;
      if (state.entries.length > maxEntries) {
        state.entries.splice(0, state.entries.length - maxEntries);
      }
    },
  },
});

export const {appendLog} = logSlice.actions;
export default logSlice.reducer;
