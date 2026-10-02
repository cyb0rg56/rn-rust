jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('../src/specs/NativeCliBackend', () => ({
  __esModule: true,
  default: {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    request: jest.fn(() => Promise.resolve('{}')),
    log: jest.fn(),
    onNotification: jest.fn(() => ({remove: jest.fn()})),
    onStderr: jest.fn(() => ({remove: jest.fn()})),
    onExit: jest.fn(() => ({remove: jest.fn()})),
  },
}));

beforeEach(() => {
  const native = jest.requireMock('../src/specs/NativeCliBackend').default;
  native.start.mockReset();
  native.start.mockResolvedValue(undefined);
  native.stop.mockReset();
  native.stop.mockResolvedValue(undefined);
  native.request.mockReset();
  native.request.mockResolvedValue('{}');
  native.log.mockReset();
  native.onNotification.mockReset();
  native.onNotification.mockImplementation(() => ({remove: jest.fn()}));
  native.onStderr.mockReset();
  native.onStderr.mockImplementation(() => ({remove: jest.fn()}));
  native.onExit.mockReset();
  native.onExit.mockImplementation(() => ({remove: jest.fn()}));
});
