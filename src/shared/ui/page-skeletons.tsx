import type { ReactNode } from 'react';
import { ui, twMerge } from './classes.ts';

function Block({ className = '' }: { className?: string }) {
  return <div className={twMerge(ui.skeleton, className)} />;
}

function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={`Loading ${label}`}
      className="flex flex-col gap-5 max-md:gap-3.5"
    >
      <span className="sr-only">Loading {label}…</span>
      <div aria-hidden="true" className="flex flex-col gap-5 max-md:gap-3.5">
        {children}
      </div>
    </div>
  );
}

function Card({ rows = 4, hero = false }: { rows?: number; hero?: boolean }) {
  return (
    <div className={twMerge(ui.card, ui.cardBody)}>
      <Block className="mb-2 h-5 w-36" />
      {hero && <Block className="mb-3 h-12 w-48 max-md:h-10" />}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-8 items-center justify-between gap-6">
          <Block className={i % 2 ? 'w-1/3' : 'w-1/4'} />
          <Block className="w-1/3" />
        </div>
      ))}
    </div>
  );
}

function Rows({ rows = 5, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className={twMerge(ui.card, 'divide-y divide-row-divider overflow-hidden')}>
      <div className="bg-subtle px-6 py-4">
        <Block className="h-4 w-40 bg-divider" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={twMerge(
            'flex items-center justify-between gap-6 px-6 py-5 max-md:px-4',
            tall ? 'min-h-24' : 'min-h-18',
          )}
        >
          <div className="flex w-1/2 flex-col gap-3">
            <Block className="w-3/4" />
            <Block className="w-1/2" />
          </div>
          <Block className="h-5 w-1/4" />
        </div>
      ))}
    </div>
  );
}

function Filters({ fields = 2 }: { fields?: number }) {
  return (
    <div className={twMerge(ui.card, ui.cardBody)}>
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <Block key={i} className="h-touch w-full" />
        ))}
      </div>
    </div>
  );
}

export function AccountsOverviewSkeleton() {
  return (
    <Loading label="accounts">
      <Card hero rows={2} />
      <Block className="h-15 w-full" />
      <Rows rows={6} tall />
    </Loading>
  );
}
export function RecentActivitySkeleton() {
  return (
    <Loading label="recent activity">
      <Rows />
    </Loading>
  );
}
export function HomeSkeleton() {
  return (
    <>
      <AccountsOverviewSkeleton />
      <RecentActivitySkeleton />
    </>
  );
}
export function AccountsSkeleton() {
  return (
    <Loading label="account information">
      <Rows rows={6} />
    </Loading>
  );
}
export function AccountDetailSkeleton() {
  return (
    <Loading label="account">
      <div className="grid grid-cols-2 items-start gap-5 max-lg:grid-cols-1">
        <Card hero />
        <Card rows={8} />
      </div>
    </Loading>
  );
}
export function ActivityResultsSkeleton() {
  return (
    <Loading label="activity">
      <Rows rows={8} />
    </Loading>
  );
}
export function ActivitySkeleton() {
  return (
    <>
      <Loading label="activity filters">
        <Filters fields={7} />
        <Block className="h-touch w-3/4" />
      </Loading>
      <ActivityResultsSkeleton />
    </>
  );
}
export function ActivityDetailSkeleton() {
  return (
    <Loading label="activity details">
      <Card rows={7} />
      <Card rows={4} />
    </Loading>
  );
}
export function InsightsResultsSkeleton() {
  return (
    <Loading label="insights">
      <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
        <Card hero rows={1} />
        <Card hero rows={1} />
      </div>
      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <Card rows={8} />
        <div className={twMerge(ui.card, ui.cardBody)}>
          <Block className="h-5 w-40" />
          <Block className="mt-5 h-72 w-full" />
        </div>
      </div>
    </Loading>
  );
}
export function InsightsSkeleton() {
  return (
    <>
      <Loading label="insights filters">
        <Filters />
      </Loading>
      <InsightsResultsSkeleton />
    </>
  );
}
export function TransferSkeleton() {
  return (
    <Loading label="new transfer">
      <Block className="h-12 w-full" />
      <Card rows={5} />
      <Block className="h-touch w-40 self-end" />
    </Loading>
  );
}
export function MenuSkeleton() {
  return (
    <Loading label="menu">
      <Rows rows={3} />
      <Rows rows={1} />
    </Loading>
  );
}
export function NotFoundSkeleton() {
  return (
    <Loading label="page">
      <Card rows={2} />
    </Loading>
  );
}
export function LoginSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-topbar bg-chrome" />
      <div className="mx-auto flex w-full max-w-110 flex-col gap-5 px-4 py-16">
        <Loading label="sign in">
          <Block className="h-7 w-28 self-center" />
          <Card rows={5} />
        </Loading>
      </div>
    </div>
  );
}
