import {configureStore} from '@reduxjs/toolkit';

import logReducer from './logSlice';
import sessionReducer from './sessionSlice';

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    log: logReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
