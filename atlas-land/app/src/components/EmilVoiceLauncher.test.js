import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render } from '@testing-library/react';
import EmilVoiceLauncher from './EmilVoiceLauncher';

test.each([true, false])('speech remains independently interruptible when microphone active=%s', (active) => {
  const voice = { active, speaking: true, statusLabel: 'EMIL speaking', stop: jest.fn(), cancelSpeech: jest.fn() };
  const view = render(<EmilVoiceLauncher voice={voice} onOpen={jest.fn()} />);
  fireEvent.click(view.getByRole('button', { name: 'Stop EMIL speaking' }));
  expect(voice.cancelSpeech).toHaveBeenCalledTimes(1);
  expect(voice.stop).not.toHaveBeenCalled();
  expect(view.getByText('EMIL speaking')).toBeVisible();
});

test.each(['Connecting…', 'Listening', 'Updating map…', 'EMIL speaking', 'Push to talk ready'])('minimized launcher reports %s without claiming it is always listening', (statusLabel) => {
  const stop = jest.fn();
  const onOpen = jest.fn();
  const view = render(<EmilVoiceLauncher voice={{ active: true, statusLabel, stop }} onOpen={onOpen} />);
  expect(view.getByText(statusLabel)).toBeVisible();
  fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: 'Stop live voice' }));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test('an inactive voice error remains discoverable when the conversation is minimized', () => {
  const view = render(<EmilVoiceLauncher voice={{ active: false, error: 'Microphone access was denied' }} onOpen={jest.fn()} />);
  expect(view.getByRole('button', { name: 'Open map assistant' })).toHaveAttribute('title', 'Open conversation · Microphone access was denied');
  expect(view.getByText('Voice needs attention')).toBeVisible();
  expect(view.queryByRole('button', { name: 'Stop live voice' })).toBeNull();
});
