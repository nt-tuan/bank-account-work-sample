import { describe, expect, it } from 'vitest';
import { twMerge, ui } from './classes.ts';

describe('theme-aware class merging', () => {
  it('overrides custom text sizes without removing text colors', () => {
    expect(twMerge('text-md text-muted', 'text-2xs')).toBe('text-muted text-2xs');
  });

  it('allows callers to override semantic layout and effect tokens', () => {
    const classes = twMerge(
      ui.content,
      'max-w-narrow',
      // Keep conflicting classes in separate arguments to preserve override order when formatting.
      'min-h-touch',
      'min-h-8',
      'shadow-dialog',
      'shadow-none',
      'animate-skeleton',
      'animate-none',
    ).split(' ');
    expect(classes).toEqual(
      expect.arrayContaining(['max-w-narrow', 'min-h-8', 'shadow-none', 'animate-none']),
    );
    expect(classes).not.toEqual(expect.arrayContaining(['max-w-page']));
    for (const overridden of ['min-h-touch', 'shadow-dialog', 'animate-skeleton'])
      expect(classes).not.toContain(overridden);
  });
});
