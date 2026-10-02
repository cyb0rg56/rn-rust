/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';

import {reportError} from '../src/cli/reportError';
import {ErrorBoundary} from '../src/components/ErrorBoundary';

jest.mock('../src/cli/reportError', () => ({
  reportError: jest.fn(),
}));

function flatten(children: unknown): string {
  if (children == null || typeof children === 'boolean') {
    return '';
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(flatten).join('');
  }
  return '';
}

function Boom(): React.JSX.Element {
  throw new Error('render failed');
}

test('renders children', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <ErrorBoundary>
        <Text>Ready</Text>
      </ErrorBoundary>,
    );
  });

  expect(renderer!.root.findByType(Text).props.children).toBe('Ready');
});

test('shows the fallback and reports the error', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
  });

  const lines = renderer!.root
    .findAllByType(Text)
    .map(node => flatten(node.props.children));
  expect(lines).toEqual(
    expect.arrayContaining(['The UI hit an error', 'render failed']),
  );
  expect(reportError).toHaveBeenCalledWith(
    expect.objectContaining({message: 'render failed'}),
  );
  errorSpy.mockRestore();
});
