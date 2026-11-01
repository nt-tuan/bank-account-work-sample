import { AccountType, Category } from '../../shared/domain/enums.ts';

/** Hand-written seed definitions (docs/technical-design/architecture.md §5.4). The generator expands them into activity. */

export const DEMO_USERNAME = 'kenji';
export const DEMO_PASSWORD = 'demo-pass-2026';
export const MAIN_CUSTOMER_ID = 'cus_kenji';

export const BANKS = [
  { id: 'bank_host', code: '0999', name: 'Demo Banking', isHostBank: true },
  { id: 'bank_minato', code: '0152', name: 'Minato Bank', isHostBank: false },
  { id: 'bank_sakura', code: '0310', name: 'Sakura Partner Bank', isHostBank: false },
  { id: 'bank_kita', code: '0427', name: 'Kita Trust Bank', isHostBank: false },
] as const;

export const CUSTOMERS = [
  {
    id: MAIN_CUSTOMER_ID,
    displayName: 'Kenji Watanabe',
    username: DEMO_USERNAME,
    password: DEMO_PASSWORD,
  },
  { id: 'cus_misaki', displayName: 'Misaki Tanaka', username: 'misaki', password: DEMO_PASSWORD },
  { id: 'cus_ken', displayName: 'Ken Sato', username: 'ken', password: DEMO_PASSWORD },
  { id: 'cus_haruka', displayName: 'Haruka Mori', username: 'haruka', password: DEMO_PASSWORD },
] as const;

export type AccountDef = {
  id: string;
  customerId: string;
  accountNumber: string;
  name: string;
  type: AccountType;
  holderName: string;
  /** Minimum balance carried before the ledger window; the generator raises it if needed to stay non-negative. */
  baseline: number;
  restrictionReason?: string;
  closed?: boolean;
  openedDaysBefore: number;
};

export const ACCOUNTS: AccountDef[] = [
  // Main customer: six open accounts — four Active (one zero balance), two Restricted — plus two closed.
  {
    id: 'acc_everyday',
    customerId: MAIN_CUSTOMER_ID,
    accountNumber: '1032481',
    name: 'Everyday',
    type: AccountType.Checking,
    holderName: 'WATANABE KENJI',
    baseline: 160_000,
    openedDaysBefore: 2_760,
  },
  {
    id: 'acc_savings',
    customerId: MAIN_CUSTOMER_ID,
    accountNumber: '1047302',
    name: 'Savings',
    type: AccountType.Savings,
    holderName: 'WATANABE KENJI',
    baseline: 1_780_000,
    openedDaysBefore: 2_760,
  },
  {
    id: 'acc_travel',
    customerId: MAIN_CUSTOMER_ID,
    accountNumber: '1055519',
    name: 'Travel fund',
    type: AccountType.Savings,
    holderName: 'WATANABE KENJI',
    baseline: 90_000,
    openedDaysBefore: 900,
  },
  {
    id: 'acc_side',
    customerId: MAIN_CUSTOMER_ID,
    accountNumber: '1069024',
    name: 'Side business',
    type: AccountType.Checking,
    holderName: 'WATANABE KENJI',
    baseline: 0,
    openedDaysBefore: 400,
  },
  {
    id: 'acc_rent',
    customerId: MAIN_CUSTOMER_ID,
    accountNumber: '1073367',
    name: 'Rent reserve',
    type: AccountType.Checking,
    holderName: 'WATANABE KENJI',
    baseline: 80_000,
    restrictionReason: 'Please confirm your registered address with the bank.',
    openedDaysBefore: 700,
  },
  {
    id: 'acc_payroll',
    customerId: MAIN_CUSTOMER_ID,
    accountNumber: '1086148',
    name: 'Old payroll',
    type: AccountType.Savings,
    holderName: 'WATANABE KENJI',
    baseline: 20_000,
    restrictionReason: 'Blocked after a reported lost passbook.',
    openedDaysBefore: 3_100,
  },
  {
    id: 'acc_old_checking',
    customerId: MAIN_CUSTOMER_ID,
    accountNumber: '1090011',
    name: 'Old checking',
    type: AccountType.Checking,
    holderName: 'WATANABE KENJI',
    baseline: 0,
    closed: true,
    openedDaysBefore: 3_600,
  },
  {
    id: 'acc_old_savings',
    customerId: MAIN_CUSTOMER_ID,
    accountNumber: '1090028',
    name: 'Old savings',
    type: AccountType.Savings,
    holderName: 'WATANABE KENJI',
    baseline: 0,
    closed: true,
    openedDaysBefore: 3_600,
  },
  // Other customers of the demo bank: eligible, restricted and closed recipients.
  {
    id: 'acc_misaki',
    customerId: 'cus_misaki',
    accountNumber: '5815810',
    name: 'Main',
    type: AccountType.Checking,
    holderName: 'TANAKA MISAKI',
    baseline: 400_000,
    openedDaysBefore: 1_500,
  },
  {
    id: 'acc_ken',
    customerId: 'cus_ken',
    accountNumber: '6620031',
    name: 'Main',
    type: AccountType.Checking,
    holderName: 'SATO KEN',
    baseline: 300_000,
    openedDaysBefore: 1_200,
  },
  {
    id: 'acc_ken_blocked',
    customerId: 'cus_ken',
    accountNumber: '6620048',
    name: 'Business',
    type: AccountType.Checking,
    holderName: 'SATO KEN',
    baseline: 50_000,
    restrictionReason: 'Under review.',
    openedDaysBefore: 800,
  },
  {
    id: 'acc_haruka',
    customerId: 'cus_haruka',
    accountNumber: '7731102',
    name: 'Main',
    type: AccountType.Checking,
    holderName: 'MORI HARUKA',
    baseline: 0,
    closed: true,
    openedDaysBefore: 2_000,
  },
  {
    id: 'acc_haruka_open',
    customerId: 'cus_haruka',
    accountNumber: '7731119',
    name: 'Savings',
    type: AccountType.Savings,
    holderName: 'MORI HARUKA',
    baseline: 120_000,
    openedDaysBefore: 2_000,
  },
];

type Merchant = { name: string; min: number; max: number };
export const MERCHANTS: Partial<Record<Category, Merchant[]>> = {
  [Category.Groceries]: [
    { name: 'Sakura Mart Shibuya', min: 1_200, max: 6_800 },
    { name: 'Lawson Ebisu 1-chome', min: 280, max: 1_600 },
    { name: 'Life Supermarket Meguro', min: 2_400, max: 8_900 },
    { name: 'FamilyMart Daikanyama', min: 300, max: 1_300 },
  ],
  [Category.Dining]: [
    { name: 'Kaiten Sushi Ebisu', min: 2_800, max: 5_600 },
    { name: 'Soba Matsuya', min: 980, max: 1_480 },
    { name: 'Izakaya Torikizoku', min: 3_200, max: 7_400 },
    { name: 'Blue Bottle Kiyosumi', min: 620, max: 1_100 },
    { name: 'Ramen Ichiran Shinjuku', min: 1_190, max: 1_690 },
    { name: 'Trattoria Ponte', min: 4_800, max: 9_600 },
    { name: 'Mos Burger Meguro', min: 780, max: 1_380 },
  ],
  [Category.Transport]: [
    { name: 'JR East Suica charge', min: 3_000, max: 5_000 },
    { name: 'Nihon Kotsu Taxi', min: 1_500, max: 4_200 },
  ],
  [Category.Shopping]: [
    { name: 'Uniqlo Shibuya', min: 1_990, max: 12_900 },
    { name: 'Amazon.co.jp', min: 980, max: 18_400 },
    { name: 'Bic Camera Yurakucho', min: 2_400, max: 26_800 },
  ],
  [Category.Health]: [
    { name: 'Matsumoto Kiyoshi Ebisu', min: 680, max: 3_400 },
    { name: 'Ebisu Dental Clinic', min: 2_800, max: 4_600 },
  ],
  [Category.Entertainment]: [
    { name: 'Toho Cinemas Shinjuku', min: 1_900, max: 3_800 },
    { name: 'Tokyo Dome City', min: 2_500, max: 8_000 },
  ],
  [Category.Education]: [
    { name: 'Kinokuniya Books', min: 1_100, max: 4_400 },
    { name: 'Online course — Learnly', min: 2_400, max: 6_000 },
  ],
  [Category.Travel]: [
    { name: 'JR Central Shinkansen', min: 13_870, max: 14_720 },
    { name: 'Hotel Kanade Kyoto', min: 9_800, max: 22_000 },
  ],
  [Category.Other]: [
    { name: 'Japan Post counter', min: 140, max: 1_800 },
    { name: 'Ward office certificate fee', min: 300, max: 600 },
  ],
};
