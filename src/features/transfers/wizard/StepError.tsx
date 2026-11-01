import { ui } from '@/shared/ui/classes.ts';
import { IconAlertCircle } from '@/shared/ui/icons.tsx';

export function StepError({ error }: { error: string | null }) {
  return error ? (
    <p className={ui.formError} role="alert">
      <IconAlertCircle size={16} />
      <span>Your transfer wasn't sent and nothing was recorded. {error}</span>
    </p>
  ) : null;
}
