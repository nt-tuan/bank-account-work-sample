import { DEMO_SCENARIOS } from '../../shared/domain/constants.ts';
import { DEMO_PASSWORD, DEMO_USERNAME } from '../fixtures/definitions.ts';

/** Makes valid examples discoverable without reading source (spec §12). Mirrors the core and partner fixtures. */
export const DEMO_RECIPIENTS = [
  {
    bankName: 'Demo Banking',
    bankCode: '0999',
    accountNumber: '5815810',
    holderName: 'TANAKA MISAKI',
    note: 'Another customer of this bank — can receive',
  },
  {
    bankName: 'Demo Banking',
    bankCode: '0999',
    accountNumber: '6620048',
    holderName: 'SATO KEN',
    note: 'Restricted — cannot receive',
  },
  {
    bankName: 'Demo Banking',
    bankCode: '0999',
    accountNumber: '7731102',
    holderName: 'MORI HARUKA',
    note: 'Closed — cannot receive',
  },
  {
    bankName: 'Demo Banking',
    bankCode: '0999',
    accountNumber: '1047302',
    holderName: 'WATANABE KENJI',
    note: 'Your own Savings account, entered as a recipient',
  },
  {
    bankName: 'Minato Bank',
    bankCode: '0152',
    accountNumber: '4012733',
    holderName: 'SUZUKI HARUTO',
    note: 'Partner bank — can receive',
  },
  {
    bankName: 'Minato Bank',
    bankCode: '0152',
    accountNumber: '4019001',
    holderName: 'NAKAMURA YUI',
    note: 'Partner bank — closed',
  },
  {
    bankName: 'Minato Bank',
    bankCode: '0152',
    accountNumber: '4019118',
    holderName: 'ITO SORA',
    note: 'Partner bank — frozen',
  },
  {
    bankName: 'Minato Bank',
    bankCode: '0152',
    accountNumber: '4099999',
    holderName: '—',
    note: 'Does not exist',
  },
  {
    bankName: 'Sakura Partner Bank',
    bankCode: '0310',
    accountNumber: '3107777',
    holderName: 'TAKAHASHI-MONTGOMERY ELIZABETH',
    note: '30-character holder name',
  },
  {
    bankName: 'Kita Trust Bank',
    bankCode: '0427',
    accountNumber: '2700418',
    holderName: 'YAMADA AOI',
    note: 'Name lookup unavailable — type the name (wrong name fails at execution)',
  },
];

export function demoCatalog(pendingScenario: string | null) {
  return {
    credentials: { username: DEMO_USERNAME, password: DEMO_PASSWORD },
    scenarios: DEMO_SCENARIOS.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    })),
    recipients: DEMO_RECIPIENTS,
    pendingScenario,
  };
}
