import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BalancePanel } from './BalancePanel.tsx';

function renderPanel(onRefresh: () => Promise<unknown>) {
  render(
    <BalancePanel
      accounts={[]}
      hidden={false}
      onToggle={() => {}}
      updatedAt={Date.UTC(2026, 10, 1)}
      refreshing={false}
      refreshFailed={false}
      onRefresh={onRefresh}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
}

describe('Home refresh feedback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('stays disabled for 300ms after a fast response and prevents repeated clicks', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderPanel(refresh);
    const button = screen.getByRole('button', { name: 'Refreshing…' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(button).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('waits for a slow response after the minimum duration', async () => {
    let finish!: () => void;
    renderPanel(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('keeps the minimum feedback duration after a rejected refresh and enables retry', async () => {
    renderPanel(() => Promise.reject(new Error('offline')));
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });
});
