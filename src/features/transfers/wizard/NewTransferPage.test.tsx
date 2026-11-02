import { AccountType, AccountUsabilityStatus } from '@domain/domain/enums.ts';
import { ApiFailureKind, UnknownFailureCause, ApiError } from '@/shared/api/http.ts';
import { ErrorCode } from '@domain/errors.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, Link, type InitialEntry } from 'react-router';
import { qk } from '@/shared/api/keys.ts';
import { LiveRegionProvider } from '@/shared/ui/live-region.tsx';
import type * as SubmissionModule from '../submission/submit.ts';
import type * as ProgressModule from './TransferProgress.tsx';
import type * as SummaryModule from './SourceSummary.tsx';
import type { AccountSummary, Session } from '@domain/schemas/api.ts';

const lookup = vi.fn();
const createTransfer = vi.fn();
const { renderProgress, renderSummary } = vi.hoisted(() => ({
  renderProgress: vi.fn(),
  renderSummary: vi.fn(),
}));

// Observe real siblings to catch subscriptions accidentally moving back into the flow/provider.
vi.mock('./TransferProgress.tsx', async (importOriginal) => {
  const actual = await importOriginal<typeof ProgressModule>();
  return {
    TransferProgress: (props: Parameters<typeof actual.TransferProgress>[0]) => {
      renderProgress();
      return <actual.TransferProgress {...props} />;
    },
  };
});
vi.mock('./SourceSummary.tsx', async (importOriginal) => {
  const actual = await importOriginal<typeof SummaryModule>();
  return {
    SourceSummary: (props: Parameters<typeof actual.SourceSummary>[0]) => {
      renderSummary();
      return <actual.SourceSummary {...props} />;
    },
  };
});
vi.mock('@/shared/api/endpoints.ts', () => ({
  api: {
    accounts: async (): Promise<AccountSummary[]> => {
      const source: AccountSummary = {
        id: 'acc_everyday',
        name: 'Everyday',
        type: AccountType.Checking,
        maskedNumber: '•••2481',
        bank: { id: 'bank_host', code: '0999', name: 'Demo Banking' },
        status: AccountUsabilityStatus.Active,
        restrictionReason: null,
        canSend: true,
        canReceive: true,
        currentMinor: 500_000,
        heldMinor: 0,
        availableMinor: 500_000,
        openedAt: '2020-01-01T00:00:00Z',
      };
      return [source, { ...source, id: 'acc_savings', name: 'Savings', maskedNumber: '•••9922' }];
    },
    banks: async () => [
      { id: 'bank_host', code: '0999', name: 'Demo Banking', isHostBank: true },
      { id: 'bank_minato', code: '0152', name: 'Minato Bank', isHostBank: false },
    ],
    session: async (): Promise<Session> => ({
      authenticated: true,
      customer: { id: 'c', displayName: 'K' },
      csrfToken: 't',
      expiresAt: null,
      transferLimit: { minMinor: 1, maxMinor: 1_000_000 },
      demoControls: false,
    }),
    lookup: (...args: unknown[]) => lookup(...args),
    createTransfer: (...args: unknown[]) => createTransfer(...args),
  },
}));

// Exercise real retries without wall-clock backoff in controller integration tests.
vi.mock('../submission/submit.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof SubmissionModule>();
  return {
    ...actual,
    submitTransfer: (
      send: Parameters<typeof actual.submitTransfer>[0],
      options: Parameters<typeof actual.submitTransfer>[1],
    ) => actual.submitTransfer(send, { ...options, delaysMs: [0, 0], jitter: 0 }),
  };
});

const { NewTransferPage } = await import('@/app/pages/NewTransferPage.tsx');

function renderWizard(entry: InitialEntry = '/transfers/new?from=acc_everyday') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/transfers/new',
        element: (
          <>
            <Link to="/">Home</Link>
            <NewTransferPage />
          </>
        ),
      },
      { path: '/', element: <h1>Home</h1> },
      { path: '/activity/:activityId', element: <h1>Activity details</h1> },
    ],
    { initialEntries: [entry] },
  );
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <LiveRegionProvider>
        <RouterProvider router={router} />
      </LiveRegionProvider>
    </QueryClientProvider>,
  );
  return { client, router, unmount };
}

it('focuses and announces the first invalid field at each input step', async () => {
  const user = userEvent.setup();
  renderWizard('/transfers/new');
  await screen.findByRole('heading', { name: 'Which account are you sending from?' });
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('radio', { name: /^Everyday/ })).toHaveFocus();
  expect(screen.getByRole('alert')).toHaveTextContent('Choose an account to send from.');
  await user.click(screen.getByRole('radio', { name: /^Everyday/ }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('combobox', { name: /Bank/ })).toHaveFocus();
  expect(screen.getAllByRole('alert').map((node) => node.textContent)).toContain('Choose a bank.');
  await user.click(screen.getByRole('radio', { name: 'Own accounts' }));
  await user.click(screen.getByRole('radio', { name: /^Savings/ }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('textbox', { name: /Amount/ })).toHaveFocus();
  expect(screen.getByRole('alert')).toHaveTextContent('This field is required.');
});

describe('recipient lookup in the wizard (AC-11)', () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it('looks up on blur, not per keystroke, and the found name replaces the field and becomes read-only', async () => {
    lookup.mockResolvedValue({
      outcome: 'found',
      holderName: 'SUZUKI HARUTO',
      bank: { id: 'bank_minato', code: '0152', name: 'Minato Bank' },
      maskedNumber: '•••2733',
    });
    const user = userEvent.setup();
    renderWizard();
    expect(await screen.findByRole('heading', { name: 'Who are you sending to?' })).toHaveFocus();
    await user.click(screen.getByRole('combobox', { name: /Bank/ }));
    await user.click(screen.getByRole('option', { name: 'Minato Bank (0152)' }));
    await user.type(screen.getByLabelText(/Account number/), '4012733');
    expect(lookup).not.toHaveBeenCalled();
    await user.tab();
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    const name = await screen.findByDisplayValue('SUZUKI HARUTO');
    expect(name).toHaveAttribute('readonly');
    expect(screen.getByText('Name registered at the bank')).toBeInTheDocument();
  });

  it('disables recipient controls during lookup and looks up again when the bank changes', async () => {
    let complete!: (result: unknown) => void;
    let completeChanged!: (result: unknown) => void;
    lookup.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    lookup.mockReturnValueOnce(
      new Promise((resolve) => {
        completeChanged = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole('combobox', { name: /Bank/ }));
    await user.click(screen.getByRole('option', { name: 'Minato Bank (0152)' }));
    const number = screen.getByLabelText(/Account number/);
    await user.type(number, '4012733');
    await user.tab();
    expect(screen.getByRole('combobox', { name: /Bank/ })).toBeDisabled();
    expect(number).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    complete({ outcome: 'found', holderName: 'SUZUKI HARUTO' });
    await screen.findByDisplayValue('SUZUKI HARUTO');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus());
    await user.click(screen.getByRole('combobox', { name: /Bank/ }));
    await user.click(screen.getByRole('option', { name: 'Demo Banking (0999)' }));
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue('');
    expect(lookup.mock.calls[1]![0]).toEqual({ bankId: 'bank_host', accountNumber: '4012733' });
    completeChanged({ outcome: 'found', holderName: 'SATO KEN' });
    expect(await screen.findByDisplayValue('SATO KEN')).toHaveAttribute('readonly');
  });

  it('enables manual entry with a warning when the name cannot be displayed, and editing the number clears it', async () => {
    lookup.mockResolvedValue({
      outcome: 'unavailable',
      holderName: null,
      bank: { id: 'bank_minato', code: '0152', name: 'Minato Bank' },
      maskedNumber: '•••0418',
    });
    const user = userEvent.setup();
    renderWizard();
    await screen.findByRole('heading', { name: 'Who are you sending to?' });
    await user.click(screen.getByRole('combobox', { name: /Bank/ }));
    await user.click(screen.getByRole('option', { name: 'Minato Bank (0152)' }));
    await user.type(screen.getByLabelText(/Account number/), '2700418');
    await user.tab();
    const name = await screen.findByRole('textbox', { name: /Recipient name/ });
    await waitFor(() => expect(name).toBeEnabled());
    expect(await screen.findByText(/can't display the name right now/)).toBeInTheDocument();
    await user.type(name, 'yamada aoi');
    await user.type(screen.getByLabelText(/Account number/), '{backspace}');
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue('');
  });
});

async function reviewOwnTransfer(user: ReturnType<typeof userEvent.setup>) {
  const view = renderWizard();
  await user.click(await screen.findByRole('radio', { name: 'Own accounts' }));
  await user.click(screen.getByRole('radio', { name: /^Savings/ }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByLabelText(/Amount/), '100');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('heading', { name: 'Review your transfer' })).toHaveFocus();
  return view;
}

describe('wizard controllers and order lifecycle', () => {
  beforeEach(() => {
    createTransfer.mockReset();
    vi.restoreAllMocks();
  });

  it('clears a destination that becomes the source and requires a new selection', async () => {
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Change source account' }));
    await user.click(screen.getByRole('radio', { name: /^Savings/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Who are you sending to?' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an account to send to.');
    await user.click(screen.getByRole('radio', { name: /^Everyday/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText(/Amount/)).toHaveValue('100');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Review your transfer' })).toBeInTheDocument();
  });

  it('revalidates a selected destination when refreshed accounts can no longer receive', async () => {
    const user = userEvent.setup();
    const { client } = await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Change destination' }));
    act(() => {
      client.setQueryData<AccountSummary[]>(qk.accounts.all, (accounts) =>
        accounts?.map((account) =>
          account.id === 'acc_savings' ? { ...account, canReceive: false } : account,
        ),
      );
    });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      "This account can't receive transfers right now.",
    );
    expect(screen.getByRole('heading', { name: 'Who are you sending to?' })).toBeInTheDocument();
  });

  it('warns about a possibly sent transfer while submission is still pending', async () => {
    createTransfer.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    await user.click(screen.getByRole('link', { name: 'Home' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Leaving does not cancel it.');
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('Nothing has been sent.');
  });

  it('preserves the review key after a CSRF rejection and waits for an explicit retry', async () => {
    createTransfer
      .mockRejectedValueOnce(
        new ApiError({
          kind: ApiFailureKind.Rejected,
          status: 403,
          code: ErrorCode.CSRF_INVALID,
          message: 'Your session was refreshed. Please try again.',
        }),
      )
      .mockResolvedValue({
        id: 'TRF-created',
        sourceActivityId: 'ACT-created',
        status: 'processing',
      });
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session was refreshed.');
    expect(createTransfer).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    await screen.findByRole('heading', { name: 'Activity details' });
    expect(createTransfer.mock.calls[1]!.slice(0, 2)).toEqual(
      createTransfer.mock.calls[0]!.slice(0, 2),
    );
  });

  it('keeps an earlier unknown outcome and key through CSRF rejections on automatic and manual retry', async () => {
    createTransfer
      .mockRejectedValueOnce(
        new ApiError({
          kind: ApiFailureKind.Unknown,
          cause: UnknownFailureCause.Network,
        }),
      )
      .mockRejectedValue(
        new ApiError({
          kind: ApiFailureKind.Rejected,
          status: 403,
          code: ErrorCode.CSRF_INVALID,
          message: 'CSRF',
        }),
      );
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    await screen.findByRole('heading', { name: "We couldn't confirm your transfer" });
    expect(createTransfer).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: "We couldn't confirm your transfer" });
    expect(createTransfer).toHaveBeenCalledTimes(3);
    for (const call of createTransfer.mock.calls)
      expect(call.slice(0, 2)).toEqual(createTransfer.mock.calls[0]!.slice(0, 2));
    expect(screen.queryByRole('button', { name: 'Change amount' })).not.toBeInTheDocument();
  });

  it('keeps a review key when revisiting without edits and replaces it after an edit', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    expect(uuid).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Change amount' }));
    expect(screen.getByRole('heading', { name: 'How much?' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Review your transfer' })).toHaveFocus();
    expect(uuid).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Change amount' }));
    await user.type(screen.getByLabelText(/Amount/), '0');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(uuid).toHaveBeenCalledTimes(2);
  });

  it('retries unknown outcomes with the same body and key, including manual retry', async () => {
    createTransfer.mockRejectedValue(
      new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Network }),
    );
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    expect(
      await screen.findByRole('heading', { name: "We couldn't confirm your transfer" }),
    ).toHaveFocus();
    expect(createTransfer).toHaveBeenCalledTimes(3);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: "We couldn't confirm your transfer" }),
    ).toHaveFocus();
    expect(createTransfer).toHaveBeenCalledTimes(6);
    const [body, key] = createTransfer.mock.calls[0]!;
    for (const call of createTransfer.mock.calls) expect(call.slice(0, 2)).toEqual([body, key]);
  });

  it('returns a definitive rejection to its owning step and uses a new key after correction', async () => {
    createTransfer.mockRejectedValueOnce(
      new ApiError({
        kind: ApiFailureKind.Rejected,
        status: 422,
        code: ErrorCode.INSUFFICIENT_FUNDS,
        message: 'Insufficient funds.',
      }),
    );
    createTransfer.mockRejectedValue(
      new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Network }),
    );
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    await screen.findByRole('heading', { name: 'How much?' });
    await user.clear(screen.getByLabelText(/Amount/));
    await user.type(screen.getByLabelText(/Amount/), '50');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    await screen.findByRole('heading', { name: "We couldn't confirm your transfer" });
    expect(createTransfer.mock.calls[1]![1]).not.toBe(createTransfer.mock.calls[0]![1]);
    expect(createTransfer.mock.calls[1]![0]).toMatchObject({ amount: '50' });
  });

  it('keeps the command but renews the key after a review-owned rejection', async () => {
    createTransfer
      .mockRejectedValueOnce(
        new ApiError({
          kind: ApiFailureKind.Rejected,
          status: 503,
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: 'Busy',
        }),
      )
      .mockRejectedValue(
        new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Network }),
      );
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The service is busy. Nothing was sent.',
    );
    expect(screen.getByRole('heading', { name: 'Review your transfer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm transfer' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    await screen.findByRole('heading', { name: "We couldn't confirm your transfer" });
    expect(createTransfer.mock.calls[1]![0]).toEqual(createTransfer.mock.calls[0]![0]);
    expect(createTransfer.mock.calls[1]![1]).not.toBe(createTransfer.mock.calls[0]![1]);
  });

  it('blocks duplicate confirm before a render and bypasses the leave guard after creation', async () => {
    let complete!: (value: unknown) => void;
    createTransfer.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    const confirm = screen.getByRole('button', { name: 'Confirm transfer' });
    confirm.focus();
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(createTransfer).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveFocus();
    await act(async () => {
      complete({ id: 'TRF-created', sourceActivityId: 'ACT-created', status: 'processing' });
    });
    expect(await screen.findByRole('heading', { name: 'Activity details' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('blocks leaving a draft, keeps edits on cancel, and leaves on confirmation', async () => {
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('link', { name: 'Home' }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('heading', { name: 'Review your transfer' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Home' }));
    await user.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('guards a pristine prefilled form after changing step, including beforeunload', async () => {
    const user = userEvent.setup();
    renderWizard({
      pathname: '/transfers/new',
      state: {
        prefill: {
          sourceAccountId: 'acc_everyday',
          kind: 'own',
          destAccountId: 'acc_savings',
        },
      },
    });
    await screen.findByRole('heading', { name: 'Who are you sending to?' });
    const pristine = new Event('beforeunload', { cancelable: true });
    fireEvent(window, pristine);
    expect(pristine.defaultPrevented).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'How much?' })).toBeInTheDocument();
    const navigated = new Event('beforeunload', { cancelable: true });
    fireEvent(window, navigated);
    expect(navigated.defaultPrevented).toBe(true);
    await user.click(screen.getByRole('link', { name: 'Home' }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('heading', { name: 'How much?' })).toBeInTheDocument();
  });

  it('aborts the pending submission when the wizard unmounts', async () => {
    createTransfer.mockImplementation(
      (_command: unknown, _key: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    );
    const user = userEvent.setup();
    const { unmount } = await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    const signal = createTransfer.mock.calls[0]![2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => {
      unmount();
    });
    expect(signal.aborted).toBe(true);
    expect(createTransfer).toHaveBeenCalledTimes(1);
  });
});

async function fillRecipient(user: ReturnType<typeof userEvent.setup>, number = '4012733') {
  await user.click(await screen.findByRole('combobox', { name: /Bank/ }));
  await user.click(screen.getByRole('option', { name: 'Minato Bank (0152)' }));
  await user.type(screen.getByLabelText(/Account number/), number);
  await user.tab();
}

async function advanceToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(screen.getByLabelText(/Amount/), '100');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('heading', { name: 'Review your transfer' });
}

describe('wizard render isolation', () => {
  beforeEach(() => {
    lookup.mockReset();
    createTransfer.mockReset();
  });

  it('keeps field edits, dirty state, validation and lookup updates out of progress and source summary', async () => {
    lookup.mockResolvedValue({ outcome: 'found', holderName: 'SUZUKI HARUTO' });
    const user = userEvent.setup();
    renderWizard();
    await screen.findByRole('heading', { name: 'Who are you sending to?' });
    const progressRenders = renderProgress.mock.calls.length;
    const summaryRenders = renderSummary.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Choose a bank.')).toBeInTheDocument();
    await fillRecipient(user);
    await screen.findByDisplayValue('SUZUKI HARUTO');
    expect(renderProgress).toHaveBeenCalledTimes(progressRenders);
    expect(renderSummary).toHaveBeenCalledTimes(summaryRenders);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    const amountProgressRenders = renderProgress.mock.calls.length;
    const amountSummaryRenders = renderSummary.mock.calls.length;
    await user.type(screen.getByLabelText(/Amount/), '500001');
    await user.type(screen.getByLabelText(/Reference/), 'invalid!');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByText('The amount is more than the available balance of this account.'),
    ).toBeInTheDocument();
    expect(renderProgress).toHaveBeenCalledTimes(amountProgressRenders);
    expect(renderSummary).toHaveBeenCalledTimes(amountSummaryRenders);
  });

  it('warns that a transfer may have been sent when leaving an unknown outcome', async () => {
    createTransfer.mockRejectedValue(
      new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Network }),
    );
    const user = userEvent.setup();
    await reviewOwnTransfer(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    await screen.findByRole('heading', { name: "We couldn't confirm your transfer" });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: "We couldn't confirm your transfer" });
    expect(createTransfer).toHaveBeenCalledTimes(6);
    await user.click(screen.getByRole('link', { name: 'Home' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Your transfer may already have been sent.');
    expect(dialog).not.toHaveTextContent('Nothing has been sent.');
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(
      screen.getByRole('heading', { name: "We couldn't confirm your transfer" }),
    ).toBeInTheDocument();
  });
});

describe('Step ownership and recipient lifecycle', () => {
  beforeEach(() => {
    lookup.mockReset();
    createTransfer.mockReset();
    vi.restoreAllMocks();
  });

  it('validates Source, Destination and Amount before navigating; focuses headings on mount without stealing focus on edits', async () => {
    const user = userEvent.setup();
    renderWizard('/transfers/new');
    const initial = await screen.findByRole('heading', {
      name: 'Which account are you sending from?',
    });
    expect(initial).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Choose an account to send from.')).toBeInTheDocument();
    expect(initial).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Everyday/ })).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: /^Everyday/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Who are you sending to?' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Choose a bank.')).toBeInTheDocument();
    expect(lookup).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: 'Own accounts' }));
    await user.click(screen.getByRole('radio', { name: /^Savings/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const amountHeading = screen.getByRole('heading', { name: 'How much?' });
    expect(amountHeading).toHaveFocus();
    await user.type(screen.getByLabelText(/Amount/), '500001');
    expect(screen.getByLabelText(/Amount/)).toHaveFocus();
    await user.type(screen.getByLabelText(/Reference/), 'invalid!');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(amountHeading).toBeInTheDocument();
    expect(
      screen.getByText('The amount is more than the available balance of this account.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Use only A–Z, a–z, 0–9, space and ( ) . - /')).toBeInTheDocument();
  });

  it('initializes route prefill once, gives it precedence over from, and does not accept a prefilled recipient name/source', async () => {
    const user = userEvent.setup();
    const { router } = renderWizard({
      pathname: '/transfers/new',
      search: '?from=acc_everyday',
      state: {
        prefill: {
          sourceAccountId: 'acc_savings',
          bankId: 'bank_minato',
          accountNumber: '4012733',
          recipientName: 'UNVERIFIED NAME',
          recipientNameSource: 'lookup',
          amount: '42',
        },
      },
    });
    await screen.findByRole('heading', { name: 'Who are you sending to?' });
    expect(screen.getByText(/Savings ·/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Account number/)).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Who are you sending to?' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Own accounts' }));
    await user.click(screen.getByRole('radio', { name: /^Everyday/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText(/Amount/)).toHaveValue('42');
    await act(async () => {
      await router.navigate('/transfers/new?from=acc_everyday', {
        state: { prefill: { amount: '99' } },
      });
    });
    expect(screen.getByLabelText(/Amount/)).toHaveValue('42');
  });

  it.each(['hit', 'miss', 'evicted'] as const)(
    'preserves lookup name/source and key across Destination remount with cache %s',
    async (cache) => {
      const uuid = vi.spyOn(crypto, 'randomUUID');
      lookup.mockResolvedValue({ outcome: 'found', holderName: 'SUZUKI HARUTO' });
      createTransfer.mockRejectedValue(
        new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Network }),
      );
      const user = userEvent.setup();
      const { client } = renderWizard();
      if (cache === 'hit')
        client.setQueryData(qk.recipientLookup('bank_minato', '4012733'), {
          status: 'found',
          holderName: 'SUZUKI HARUTO',
          key: 'bank_minato:4012733',
        });
      await fillRecipient(user);
      expect(await screen.findByDisplayValue('SUZUKI HARUTO')).toHaveAttribute('readonly');
      expect(lookup).toHaveBeenCalledTimes(cache === 'hit' ? 0 : 1);
      await advanceToReview(user);
      expect(uuid).toHaveBeenCalledTimes(1);
      if (cache === 'evicted')
        client.removeQueries({
          queryKey: qk.recipientLookup('bank_minato', '4012733'),
          exact: true,
        });
      await user.click(screen.getByRole('button', { name: 'Change recipient' }));
      expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue('SUZUKI HARUTO');
      expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveAttribute('readonly');
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await user.click(screen.getByRole('button', { name: 'Next' }));
      expect(uuid).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
      await screen.findByRole('heading', { name: "We couldn't confirm your transfer" });
      expect(createTransfer.mock.calls[0]![0].destination).toMatchObject({
        recipientName: 'SUZUKI HARUTO',
        recipientNameSource: 'lookup',
      });
      expect(lookup).toHaveBeenCalledTimes(cache === 'hit' ? 0 : 1);
    },
  );

  it('keeps manual name/source and review key through cache updates, eviction and remount; explicit retry calls the endpoint', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');
    lookup.mockResolvedValue({ outcome: 'unavailable' });
    createTransfer.mockRejectedValue(
      new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Network }),
    );
    const user = userEvent.setup();
    const { client } = renderWizard();
    await fillRecipient(user, '2700418');
    const name = screen.getByRole('textbox', { name: /Recipient name/ });
    await waitFor(() => expect(name).toBeEnabled());
    await user.type(name, 'yamada aoi');
    await advanceToReview(user);
    const queryKey = qk.recipientLookup('bank_minato', '2700418');
    await act(async () => {
      await client.fetchQuery({
        queryKey,
        staleTime: 0,
        queryFn: async () => ({
          status: 'found',
          holderName: 'OTHER NAME',
          key: 'bank_minato:2700418',
        }),
      });
    });
    await user.click(screen.getByRole('button', { name: 'Change recipient' }));
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue('yamada aoi');
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).not.toHaveAttribute('readonly');
    fireEvent.focus(window);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(uuid).toHaveBeenCalledTimes(1);
    client.removeQueries({ queryKey, exact: true });
    await user.click(screen.getByRole('button', { name: 'Change recipient' }));
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue('yamada aoi');
    await user.click(screen.getByRole('button', { name: 'Try lookup again' }));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(uuid).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    await screen.findByRole('heading', { name: "We couldn't confirm your transfer" });
    expect(createTransfer.mock.calls[0]![0].destination).toMatchObject({
      recipientName: 'YAMADA AOI',
      recipientNameSource: 'manual',
    });
  });

  it('clears old name/source when input changes and separates cache entries by bank and number', async () => {
    lookup
      .mockResolvedValueOnce({ outcome: 'found', holderName: 'FIRST NAME' })
      .mockResolvedValueOnce({ outcome: 'found', holderName: 'SECOND NAME' })
      .mockResolvedValueOnce({ outcome: 'not_found' });
    const user = userEvent.setup();
    const { client } = renderWizard();
    await fillRecipient(user);
    await screen.findByDisplayValue('FIRST NAME');
    await user.click(screen.getByRole('combobox', { name: /Bank/ }));
    await user.click(screen.getByRole('option', { name: 'Demo Banking (0999)' }));
    await screen.findByDisplayValue('SECOND NAME');
    const number = screen.getByLabelText(/Account number/);
    await user.clear(number);
    await user.type(number, '1234567');
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue('');
    await user.tab();
    await screen.findByText('Recipient not found. Check the bank and account number.');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Who are you sending to?' })).toBeInTheDocument();
    expect(client.getQueryData(qk.recipientLookup('bank_minato', '4012733'))).toMatchObject({
      holderName: 'FIRST NAME',
    });
    expect(client.getQueryData(qk.recipientLookup('bank_host', '4012733'))).toMatchObject({
      holderName: 'SECOND NAME',
    });
    expect(client.getQueryData(qk.recipientLookup('bank_host', '1234567'))).toMatchObject({
      status: 'not_found',
    });
  });

  it('ignores a late lookup after leaving Destination, including its form writes and focus', async () => {
    let complete!: (value: unknown) => void;
    lookup
      .mockReturnValueOnce(
        new Promise((resolve) => {
          complete = resolve;
        }),
      )
      .mockResolvedValueOnce({ outcome: 'found', holderName: 'CURRENT NAME' });
    const user = userEvent.setup();
    renderWizard();
    await fillRecipient(user);
    await user.click(screen.getByRole('button', { name: 'Change' }));
    const heading = screen.getByRole('heading', { name: 'Which account are you sending from?' });
    expect(heading).toHaveFocus();
    await act(async () => {
      complete({ outcome: 'found', holderName: 'STALE NAME' });
    });
    expect(heading).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('textbox', { name: /Recipient name/ })).toHaveValue('');
    await user.click(screen.getByRole('combobox', { name: /Bank/ }));
    await user.click(screen.getByRole('option', { name: 'Demo Banking (0999)' }));
    expect(await screen.findByDisplayValue('CURRENT NAME')).toHaveAttribute('readonly');
    expect(screen.queryByDisplayValue('STALE NAME')).not.toBeInTheDocument();
  });

  it('cleans up deferred lookup focus when Destination unmounts', async () => {
    let complete!: (value: unknown) => void;
    lookup.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await fillRecipient(user);
    vi.useFakeTimers();
    try {
      await act(async () => {
        complete({ outcome: 'found', holderName: 'SUZUKI HARUTO' });
      });
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      const heading = screen.getByRole('heading', { name: 'Which account are you sending from?' });
      expect(heading).toHaveFocus();
      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(heading).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retains server field errors when the destination step mounts after rejection', async () => {
    lookup.mockResolvedValue({ outcome: 'found', holderName: 'SUZUKI HARUTO' });
    createTransfer.mockRejectedValue(
      new ApiError({
        kind: ApiFailureKind.Rejected,
        status: 400,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Check the recipient.',
        fieldErrors: { 'destination.accountNumber': 'Account number rejected by server.' },
      }),
    );
    const user = userEvent.setup();
    renderWizard();
    await fillRecipient(user);
    await screen.findByDisplayValue('SUZUKI HARUTO');
    await advanceToReview(user);
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));
    expect(await screen.findByRole('heading', { name: 'Who are you sending to?' })).toHaveFocus();
    expect(screen.getByText(/Check the recipient\./).closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByText('Account number rejected by server.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Account number/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('retries unavailable cached results against the endpoint', async () => {
    lookup
      .mockResolvedValueOnce({ outcome: 'unavailable' })
      .mockResolvedValueOnce({ outcome: 'found', holderName: 'RECOVERED NAME' });
    const user = userEvent.setup();
    renderWizard();
    await fillRecipient(user);
    await user.click(await screen.findByRole('button', { name: 'Try lookup again' }));
    expect(await screen.findByDisplayValue('RECOVERED NAME')).toHaveAttribute('readonly');
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
