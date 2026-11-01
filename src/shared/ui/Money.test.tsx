import { Direction } from '@domain/domain/enums.ts';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Money } from './primitives.tsx';

describe('<Money> (AC-12)', () => {
  it('renders signed en-US yen', () => {
    render(<Money minor={280000} sign={Direction.Credit} />);
    expect(screen.getByText('+¥280,000')).toBeInTheDocument();
  });

  it('keeps the real value out of the DOM when hidden', () => {
    const { container } = render(<Money minor={3168460} hidden />);
    expect(container.textContent).not.toMatch(/3,168,460|3168460/);
    expect(container.innerHTML).not.toMatch(/3,168,460|3168460/);
    expect(screen.getByText('Amount hidden')).toBeInTheDocument();
    expect(container.textContent).toContain('¥ ••••••');
  });

  it('lets callers override the credit color while preserving the custom font size', () => {
    render(<Money minor={280000} sign={Direction.Credit} className="text-md text-muted" />);
    const amount = screen.getByText('+¥280,000');
    expect(amount).toHaveClass('tabular-nums', 'text-md', 'text-muted');
    expect(amount).not.toHaveClass('text-ok');
  });
});
