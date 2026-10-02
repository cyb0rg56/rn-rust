import type {PayloadAction} from '@reduxjs/toolkit';
import {createSlice} from '@reduxjs/toolkit';

export type SessionStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

type SessionState = {
  status: SessionStatus;
  lastError: string | null;
};

const initialState: SessionState = {
  status: 'idle',
  lastError: null,
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setStatus(state, action: PayloadAction<SessionStatus>) {
      state.status = action.payload;
      if (action.payload !== 'error') {
        state.lastError = null;
      }
    },
    setError(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.lastError = action.payload;
    },
  },
});

export const {setStatus, setError} = sessionSlice.actions;
export default sessionSlice.reducer;
