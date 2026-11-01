import { ActionStatus } from '@/shared/ui/action-status.ts';
import {
  AccountUsabilityStatus,
  ActivityKind,
  ActivityStatus,
  Direction,
  HoldKind,
  TransferStatus,
} from '@domain/domain/enums.ts';
import { ErrorCode, ExecutionFailureCode } from '@domain/errors.ts';
import { ApiFailureKind, ApiError } from '@/shared/api/http.ts';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountDetailController } from '@/features/accounts/useAccountDetailController.ts';
import { useActivityDetailController } from '@/features/activity/useActivityDetailController.ts';
import { account, entry, transferEntry } from '@/test/banking-fixtures.ts';
import type { AccountDetail, ActivityDetail } from '@domain/schemas/api.ts';
import { AccountDetailPage } from './AccountDetailPage.tsx';
import { ActivityDetailPage } from './ActivityDetailPage.tsx';

vi.mock('@/features/accounts/useAccountDetailController.ts');
vi.mock('@/features/activity/useActivityDetailController.ts');

const copy = vi.fn();
const refetch = vi.fn();
type AccountState = ReturnType<typeof useAccountDetailController>;
type ActivityState = ReturnType<typeof useActivityDetailController>;

function queryResult<T>(data?: T, error?: Error) {
  const client = new QueryClient();
  const query = client.getQueryCache().build<T, Error>(client, { queryKey: ['detail'] });
  if (data !== undefined) query.setData(data);
  if (error) query.setState({ status: 'error', error });
  const result = new QueryObserver<T>(client, {
    queryKey: ['detail'],
    enabled: false,
  }).getCurrentResult();
  client.clear();
  return {
    ...result,
    refetch: async () => {
      refetch();
      return result;
    },
  };
}

function accountState(overrides: Partial<AccountState> = {}): AccountState {
  return {
    account: queryResult(account),
    a: account,
    copied: ActionStatus.Idle,
    copy,
    merchantHolds: [],
    transferHolds: [],
    sum: (holds) => holds.reduce((total, hold) => total + hold.amountMinor, 0),
    ...overrides,
  };
}

function activityState(overrides: Partial<ActivityState> = {}): ActivityState {
  return {
    entry: queryResult(entry),
    e: entry,
    slowTracking: false,
    elapsed: 0,
    statusRef: { current: null },
    checkAgain: refetch,
    backTo: '/activity',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAccountDetailController).mockReturnValue(accountState());
  vi.mocked(useActivityDetailController).mockReturnValue(activityState());
});

describe('AccountDetailPage UI through its controller', () => {
  it('renders account information, copy action, holds and navigation', async () => {
    const hold = {
      id: 'hold',
      kind: HoldKind.MerchantAuthorization,
      amountMinor: 1000,
      createdAt: entry.occurredAt,
      activityId: entry.id,
      description: 'Card hold',
      transferId: null,
    };
    vi.mocked(useAccountDetailController).mockReturnValue(accountState({ merchantHolds: [hold] }));
    render(
      <MemoryRouter>
        <AccountDetailPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'View activity' })).toHaveAttribute(
      'href',
      '/activity?account=everyday',
    );
    expect(screen.getByRole('link', { name: 'Transfer from this account' })).toHaveAttribute(
      'href',
      '/transfers/new?from=everyday',
    );
    expect(screen.getByRole('link', { name: /Card hold/ })).toHaveAttribute(
      'href',
      '/activity/coffee',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy account number' }));
    expect(copy).toHaveBeenCalledWith(account.accountNumber);
  });

  it('disables transfers for a restricted account and announces copy failure', () => {
    vi.mocked(useAccountDetailController).mockReturnValue(
      accountState({
        a: {
          ...account,
          status: AccountUsabilityStatus.Restricted,
          canSend: false,
          canReceive: false,
          restrictionReason: 'Under review.',
        },
        copied: ActionStatus.Failed,
      }),
    );
    render(
      <MemoryRouter>
        <AccountDetailPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Transfer from this account' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy");
    expect(screen.getByText(/Under review/)).toBeInTheDocument();
  });

  it('renders a loading state without account actions', () => {
    vi.mocked(useAccountDetailController).mockReturnValue(
      accountState({ a: undefined, account: queryResult<AccountDetail>() }),
    );
    render(
      <MemoryRouter>
        <AccountDetailPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status', { name: 'Loading account' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('link', { name: 'View activity' })).not.toBeInTheDocument();
  });

  it('retries a load error', async () => {
    vi.mocked(useAccountDetailController).mockReturnValue(
      accountState({
        a: undefined,
        account: queryResult<AccountDetail>(undefined, new Error('Unavailable')),
      }),
    );
    render(
      <MemoryRouter>
        <AccountDetailPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load this account.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

describe('ActivityDetailPage UI through its controller', () => {
  it('renders entry information and account navigation', () => {
    render(
      <MemoryRouter>
        <ActivityDetailPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: 'Activity Summary' })).toHaveTextContent(
      'Coffee shop',
    );
    expect(screen.queryByRole('region', { name: 'Transfer Details' })).not.toBeInTheDocument();
    expect(screen.getByText('−¥500')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Everyday' })).toHaveAttribute(
      'href',
      '/accounts/everyday',
    );
  });

  it('renders two sections with a delayed transfer inline, without a detail link', () => {
    vi.mocked(useActivityDetailController).mockReturnValue(
      activityState({
        e: {
          ...transferEntry,
          transferDelayedSince: entry.occurredAt,
          transfer: {
            ...transferEntry.transfer!,
            details: { ...transferEntry.transfer!.details!, delayedSince: entry.occurredAt },
          },
        },
      }),
    );
    const { container } = render(
      <MemoryRouter>
        <ActivityDetailPage />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll('section')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Activity Summary' })).toHaveTextContent('Pending');
    const details = screen.getByRole('region', { name: 'Transfer Details' });
    expect(within(details).getByText('TRF-1')).toBeInTheDocument();
    expect(within(details).queryByRole('link', { name: 'TRF-1' })).not.toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'Savings' })).toHaveAttribute(
      'href',
      '/accounts/savings',
    );
    expect(within(details).getByText('Delayed')).toBeInTheDocument();
  });

  it('offers Check again while background checks continue less frequently', async () => {
    vi.mocked(useActivityDetailController).mockReturnValue(
      activityState({ e: transferEntry, slowTracking: true, elapsed: 120_000 }),
    );
    render(
      <MemoryRouter>
        <ActivityDetailPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows failure recovery and source hold release inside Transfer Details', () => {
    vi.mocked(useActivityDetailController).mockReturnValue(
      activityState({
        e: {
          ...transferEntry,
          status: ActivityStatus.Cancelled,
          transferStatus: TransferStatus.Failed,
          transfer: {
            ...transferEntry.transfer!,
            status: TransferStatus.Failed,
            details: {
              ...transferEntry.transfer!.details!,
              status: TransferStatus.Failed,
              failureCode: ExecutionFailureCode.RECIPIENT_NAME_MISMATCH,
              failedAt: entry.occurredAt,
            },
          },
        },
      }),
    );
    render(
      <MemoryRouter>
        <ActivityDetailPage />
      </MemoryRouter>,
    );
    const details = screen.getByRole('region', { name: 'Transfer Details' });
    expect(details).toHaveTextContent('hold has been released');
    expect(within(details).getByRole('link', { name: /corrected/ })).toHaveAttribute(
      'href',
      '/transfers/new',
    );
  });

  it('shows only sender and reference for an incoming transfer owned by someone else', () => {
    vi.mocked(useActivityDetailController).mockReturnValue(
      activityState({
        e: {
          ...entry,
          kind: ActivityKind.TransferIn,
          direction: Direction.Credit,
          transfer: {
            id: null,
            status: null,
            details: null,
            reference: 'Lunch',
            counterparty: { name: 'SATO KEN', bankName: '', maskedNumber: '', accountId: null },
          },
        },
      }),
    );
    render(
      <MemoryRouter>
        <ActivityDetailPage />
      </MemoryRouter>,
    );
    const details = screen.getByRole('region', { name: 'Transfer Details' });
    expect(details).toHaveTextContent('SATO KEN');
    expect(details).toHaveTextContent('Lunch');
    expect(within(details).queryByText('Transfer ID')).not.toBeInTheDocument();
    expect(
      within(details).queryByRole('region', { name: 'Transfer status' }),
    ).not.toBeInTheDocument();
    expect(within(details).queryByRole('link')).not.toBeInTheDocument();
  });

  it('retries a load error', async () => {
    vi.mocked(useActivityDetailController).mockReturnValue(
      activityState({
        e: undefined,
        entry: queryResult<ActivityDetail>(undefined, new Error('Unavailable')),
      }),
    );
    render(
      <MemoryRouter>
        <ActivityDetailPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

it.each(['account', 'activity'])('shows not-found without retry for a missing %s', (kind) => {
  const error = new ApiError({
    kind: ApiFailureKind.Rejected,
    status: 404,
    code: ErrorCode.NOT_FOUND,
    message: 'Not found',
  });
  vi.mocked(useAccountDetailController).mockReturnValue(
    accountState({ a: undefined, account: queryResult<AccountDetail>(undefined, error) }),
  );
  vi.mocked(useActivityDetailController).mockReturnValue(
    activityState({ e: undefined, entry: queryResult<ActivityDetail>(undefined, error) }),
  );
  render(
    <MemoryRouter>
      {kind === 'account' ? <AccountDetailPage /> : <ActivityDetailPage />}
    </MemoryRouter>,
  );
  expect(screen.getByText(/couldn't find that page/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});
