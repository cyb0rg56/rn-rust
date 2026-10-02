/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';

import App from '../App';

function visibleText(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(node => flatten(node.props.children));
}

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

test('renders the CLI test screen', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(visibleText(renderer!)).toEqual(
    expect.arrayContaining([
      'Rust CLI',
      'Idle',
      'Start',
      'Stop',
      'Ping',
      'Echo',
    ]),
  );
  expect(
    renderer!.root.findByProps({accessibilityLabel: 'Stop CLI'}).props.disabled,
  ).toBe(true);
});
