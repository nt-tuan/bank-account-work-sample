import { type TransferStep, STEPS } from './types.ts';
import { twMerge } from '@/shared/ui/classes.ts';
import styles from './wizard.module.css';

export function TransferProgress({ step }: { step: TransferStep }) {
  const current = STEPS.findIndex((item) => item.id === step);
  return (
    <ol className={styles.steps} aria-label="Progress">
      {STEPS.map((item, index) => (
        <li key={item.id} aria-current={item.id === step ? 'step' : undefined}>
          <span
            className={twMerge(
              styles.dot,
              index < current ? styles.done : '',
              index === current ? styles.current : '',
            )}
            aria-hidden="true"
          >
            {index < current ? '✓' : index + 1}
          </span>
          <span className={index === current ? styles.currentLabel : ''}>
            {item.label}
            {index < current && <span className="sr-only"> (completed)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
