module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-redux|@reduxjs/toolkit|immer|reselect|redux-thunk|react-native-safe-area-context)/)',
  ],
};
