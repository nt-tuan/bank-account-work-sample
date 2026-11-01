import { extendTailwindMerge } from 'tailwind-merge';

// Match the custom theme tokens in styles/tokens.css.
export const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      animate: ['skeleton'],
      container: ['page', 'narrow'],
      shadow: ['dialog'],
      spacing: ['touch', 'topbar', 'sidebar', 'pagebar'],
      text: ['2xs', 'md'],
    },
  },
});

/**
 * Tailwind class lists for the shared design-system pieces (Foundations board), so pages repeat names, not utilities.
 * Use twMerge to compose these lists with variants or caller overrides.
 */
const contentBase =
  'flex w-full flex-col gap-5 px-8 pt-6 pb-12 max-md:gap-3.5 max-md:px-3 max-md:pt-3 max-md:pb-[calc(96px+env(safe-area-inset-bottom))]';
const btn =
  'inline-flex min-h-touch min-w-40 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border px-6 text-md font-semibold hover:no-underline disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-muted';
const linkBtn = 'inline-flex cursor-pointer items-center gap-1 hover:underline';
const status = 'inline-flex items-center gap-1.5 whitespace-nowrap [&>svg]:shrink-0';
const fieldError = 'flex items-start gap-1.5 text-bad [&>svg]:mt-[3px] [&>svg]:shrink-0';
const input =
  'min-h-touch w-full rounded-md border border-input-border bg-white px-3 py-[9px] text-ink disabled:border-divider disabled:bg-canvas disabled:text-muted aria-invalid:border-bad aria-invalid:shadow-[inset_0_0_0_1px_var(--color-bad)] [&[readonly]]:border-divider [&[readonly]]:bg-canvas';
const actions = 'flex flex-wrap items-center gap-4 max-md:[&>:is(a,button)]:flex-[1_1_100%]';

export const ui = {
  /* Page layout */
  content: twMerge(contentBase, 'max-w-page'),
  contentNarrow: twMerge(contentBase, 'max-w-narrow'),
  card: 'rounded-md bg-surface',
  cardHead:
    'flex flex-wrap items-center justify-between gap-3 border-b border-row-divider px-6 py-4 max-md:px-4',
  cardPad: 'px-6 py-5 max-md:px-4',
  cardBody: 'flex flex-col gap-3.5 px-6 py-5 max-md:px-4',
  section: 'flex flex-col gap-2.5',
  sectionHead: 'flex items-baseline justify-between gap-3 pt-2',
  note: 'flex items-start gap-2.5 rounded-md bg-canvas px-4 py-3.5 text-sm',
  empty: 'flex flex-col items-center gap-1.5 px-4 py-8 text-center',

  /* Money */
  amountHero: 'text-5xl leading-[1.2] font-light max-md:text-4xl',
  amountLg: 'text-3xl leading-[1.3] font-light',

  /* Actions: one action bar at the end of the page */
  actions: twMerge(actions, 'justify-end'),
  actionsCenter: twMerge(actions, 'justify-center'),
  btnPrimary: twMerge(btn, 'border-transparent bg-action text-white hover:bg-action-hover'),
  btnConfirm: twMerge(btn, 'border-transparent bg-confirm text-white hover:bg-confirm-hover'),
  btnOutline: twMerge(
    btn,
    'border-action bg-white text-action hover:border-action-hover hover:text-action-hover',
  ),
  /** Inline actions are text links so they align with the surrounding text. */
  linkBtn: twMerge(linkBtn, 'min-h-8 text-md text-action hover:text-action-hover'),
  /** Destructive inline action (Demo reset). */
  linkBtnDanger: twMerge(linkBtn, 'min-h-8 text-md text-bad'),
  /** A link button inside a sentence of small text. */
  linkBtnInline: twMerge(linkBtn, 'text-sm text-action hover:text-action-hover'),
  iconBtn:
    'inline-flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-md text-muted',
  rowNav:
    'flex min-h-15 items-center gap-4 rounded-md bg-surface px-5 text-ink hover:bg-row-hover hover:text-ink hover:no-underline',
  rowLink: 'text-ink hover:text-action',

  /* Status: icon + coloured text, no fills */
  status: twMerge(status, 'text-md'),
  statusSm: twMerge(status, 'text-sm'),

  /* Forms */
  field: 'flex min-w-0 flex-col gap-1.5',
  label: 'flex items-center gap-2 text-md font-medium',
  req: 'rounded-xs bg-subtle px-1.5 text-2xs leading-[18px] font-medium text-muted',
  input: twMerge(input, 'text-base'),
  /** The amount field. */
  inputLg: twMerge(input, 'text-xl'),
  hint: 'text-sm text-muted',
  fieldError: twMerge(fieldError, 'text-sm'),
  /** Form-level error at the top of a form. */
  formError: twMerge(fieldError, 'text-md'),

  /* Tabs: dark tabs over a white block */
  tabs: 'relative flex items-end gap-1.5 overflow-x-auto',
  tab: 'relative inline-flex min-h-touch min-w-27.5 flex-none cursor-pointer items-center justify-center rounded-t-md bg-tab px-4.5 text-md text-white hover:bg-tab-hover hover:no-underline aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-ink',
  tabbed: 'overflow-hidden rounded-md rounded-tl-none',

  /* Lists and filters (Activity) */
  filters: 'flex flex-col gap-3.5 px-6 py-5 max-md:p-4',
  filterGrid: 'grid grid-cols-3 items-end gap-3 max-md:grid-cols-2',
  chips: 'flex flex-wrap items-center gap-2 border-t border-row-divider pt-3',
  resultsHead: 'flex flex-wrap items-center justify-between gap-3 px-5 py-3.5',
  /** Desktop shows the table, phones show the list. */
  desktopOnly: 'max-md:hidden',
  mobileOnly: 'hidden max-md:block',
  tableWrap: 'relative overflow-x-auto',
  mobileRow:
    'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-row-divider px-4 py-3 text-md text-ink hover:bg-row-hover hover:text-ink hover:no-underline',
  chip: 'inline-flex min-h-8 items-center gap-0.5 rounded-full border border-table-head bg-white pr-1 pl-3 text-sm',
  chipRemove:
    'inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-muted',

  /* States */
  skeleton: 'h-3 animate-skeleton rounded-xs bg-subtle',

  /* Dialog */
  dialogOverlay: 'fixed inset-0 z-50 bg-chrome/50',
  dialog:
    'fixed top-1/2 left-1/2 z-51 max-h-[calc(100vh-32px)] w-[min(480px,calc(100vw-32px))] -translate-1/2 overflow-auto rounded-md bg-surface shadow-dialog',
  dialogHead: 'flex items-center justify-between gap-3 border-b border-row-divider px-6 py-4',
  dialogBody: 'flex flex-col gap-4 px-6 pt-5 pb-6',
} as const;
