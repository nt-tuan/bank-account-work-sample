import {
  AccountUsabilityStatus,
  ActivityStatus,
  Direction,
  TransferStatus,
} from '@domain/domain/enums.ts';
import type { ReactNode } from 'react';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { formatSignedYen, formatYen } from '@domain/money.ts';
import {
  IconAlertCircle,
  IconCancelled,
  IconCheckCircle,
  IconChevronLeft,
  IconClock,
  IconLock,
  IconSpinner,
  IconXCircle,
} from './icons.tsx';
import { ui, twMerge } from './classes.ts';

/** Monochrome D-arrow mark + wordmark (see Foundations board). */
export function Logo({ size = 26, label = true }: { size?: number; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth={size < 24 ? 2.75 : 2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 5h8.5a11 11 0 0 1 0 22H7z" />
        <path d="M12 16h9" />
        <path d="M17.5 12l4 4-4 4" />
      </svg>
      {label && (
        <span
          className={twMerge(
            'tracking-[0.04em] whitespace-nowrap',
            size < 24 ? 'text-base' : 'text-[17px]',
          )}
          aria-hidden="true"
        >
          <span className="font-semibold">DEMO</span> <span className="font-light">BANKING</span>
        </span>
      )}
    </span>
  );
}

/**
 * The single component that renders money. When hidden, the real value is never in the DOM,
 * accessible name or copy buffer (spec §4, Hide/show amounts).
 */
export function Money({
  minor,
  sign,
  hidden = false,
  className,
}: {
  minor: number;
  sign?: Direction;
  hidden?: boolean;
  className?: string;
}) {
  if (hidden) {
    return (
      <span className={twMerge('tabular-nums', className)}>
        <span aria-hidden="true" className="tracking-[0.08em]">
          ¥ ••••••
        </span>
        <span className="sr-only">Amount hidden</span>
      </span>
    );
  }
  const text = sign ? formatSignedYen(minor, sign) : formatYen(minor);
  return (
    <span
      className={twMerge('tabular-nums', sign === Direction.Credit ? 'text-ok' : '', className)}
    >
      {text}
    </span>
  );
}

export function AccountStatus({
  status,
}: {
  status: AccountUsabilityStatus.Active | AccountUsabilityStatus.Restricted;
}) {
  return status === AccountUsabilityStatus.Active ? (
    <span className={twMerge(ui.status, 'text-ok')}>
      <IconCheckCircle size={16} />
      Active
    </span>
  ) : (
    <span className={twMerge(ui.status, 'text-warn')}>
      <IconLock size={16} />
      Restricted
    </span>
  );
}

export function ActivityStatusText({ status }: { status: ActivityStatus }) {
  if (status === ActivityStatus.Posted)
    return <span className={twMerge(ui.status, 'text-muted')}>Posted</span>;
  if (status === ActivityStatus.Pending)
    return (
      <span className={twMerge(ui.status, 'text-warn')}>
        <IconClock size={16} />
        Pending
      </span>
    );
  return (
    <span className={twMerge(ui.status, 'text-muted')}>
      <IconCancelled size={16} />
      Cancelled
    </span>
  );
}

export function TransferStatusText({
  status,
  delayed,
  size = 16,
}: {
  status: TransferStatus;
  delayed?: boolean;
  size?: number;
}) {
  if (status === TransferStatus.Processing && delayed)
    return (
      <span className={twMerge(ui.status, 'text-warn')}>
        <IconClock size={size} />
        Delayed
      </span>
    );
  if (status === TransferStatus.Processing)
    return (
      <span className={twMerge(ui.status, 'text-action')}>
        <IconSpinner size={size} />
        Processing
      </span>
    );
  if (status === TransferStatus.Completed)
    return (
      <span className={twMerge(ui.status, 'text-ok')}>
        <IconCheckCircle size={size} />
        Completed
      </span>
    );
  return (
    <span className={twMerge(ui.status, 'text-bad')}>
      <IconXCircle size={size} />
      Failed
    </span>
  );
}

export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <span className={ui.fieldError} id={id} role="alert">
      <IconAlertCircle size={15} />
      {message}
    </span>
  );
}

export function Required() {
  return <span className={ui.req}>Required</span>;
}

/** White page header: title on list pages; Back + centered title on drill-down and flow pages. */
export function PageBar({
  title,
  back,
  flow = false,
}: {
  title: string;
  back?: { to: string; label?: string };
  flow?: boolean;
}) {
  return (
    <div
      className={twMerge(
        'relative flex min-h-pagebar items-center gap-4 bg-surface max-md:min-h-13',
        flow ? 'border-b-3 border-action' : 'border-b border-divider',
        back
          ? 'justify-center px-30 text-center max-md:px-18'
          : 'px-8 max-md:justify-center max-md:px-4 max-md:text-center',
      )}
    >
      {back && (
        <Link
          className="absolute top-1/2 left-4 inline-flex min-h-touch -translate-y-1/2 items-center gap-0.5 px-2 text-base text-ink hover:text-action max-md:left-1 max-md:text-md"
          to={back.to}
        >
          <IconChevronLeft size={20} />
          {back.label ?? 'Back'}
        </Link>
      )}
      <h1 tabIndex={-1} id="page-title" className="max-md:text-lg">
        {title}
      </h1>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={twMerge(ui.card, ui.cardBody)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={ui.skeleton} style={{ width: `${[40, 70, 55, 65, 45][i % 5]}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({
  message = "We couldn't load this.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className={twMerge(ui.card, ui.empty)} role="alert">
      <p>{message}</p>
      {onRetry && (
        <p className="text-sm">
          <button type="button" className={ui.linkBtn} onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
    </div>
  );
}

export function NotFoundView() {
  return (
    <div className={twMerge(ui.card, ui.empty)}>
      <p>We couldn't find that page.</p>
      <p className="text-sm text-muted">It may not exist, or it isn't available to you.</p>
      <p className="text-sm">
        <Link to="/">Go to Home</Link>
      </p>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={ui.empty}>
      <p>{title}</p>
      {children && <p className="text-sm text-muted">{children}</p>}
    </div>
  );
}
