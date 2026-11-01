import type { DemoScenarioId } from '@domain/domain/enums.ts';
import { ui } from '@/shared/ui/classes.ts';
import { IconClose } from '@/shared/ui/icons.tsx';
import { Select, SelectOption } from '@/shared/ui/Select.tsx';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import { useDemoControlsController } from './useDemoControlsController.ts';

export function DemoControls({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { catalog, message, confirmReset, setConfirmReset, setScenario, expire, reset, selected } =
    useDemoControlsController({ open, onOpenChange });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={ui.dialogOverlay} />
        <Dialog.Content className={ui.dialog} aria-describedby="demo-desc">
          <div className={ui.dialogHead}>
            <Dialog.Title asChild>
              <h2>
                Demo controls <span className="text-xs text-muted">· DEMO ONLY</span>
              </h2>
            </Dialog.Title>
            <Dialog.Close className={ui.iconBtn} aria-label="Close">
              <IconClose size={18} />
            </Dialog.Close>
          </div>
          <div className={ui.dialogBody}>
            <p id="demo-desc" className="text-sm text-muted">
              Deterministic scenarios for demonstrating failures. A scenario applies once to your
              next applicable request.
            </p>
            {catalog.isError && <p className="text-sm text-bad">Couldn't load demo controls.</p>}
            {catalog.data && (
              <>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="demo-scenario">
                    Scenario for the next request
                  </label>
                  <Select
                    id="demo-scenario"
                    value={selected}
                    disabled={setScenario.isPending}
                    onValueChange={(value) =>
                      setScenario.mutate((value || null) as DemoScenarioId | null)
                    }
                  >
                    <SelectOption value="">None (normal behavior)</SelectOption>
                    {catalog.data.scenarios.map((s) => (
                      <SelectOption key={s.id} value={s.id}>
                        {s.label}
                      </SelectOption>
                    ))}
                  </Select>
                  <span className={ui.hint}>
                    {catalog.data.scenarios.find((s) => s.id === selected)?.description ??
                      'Order rejections (insufficient funds, limit, restricted accounts) need no scenario — use the examples below.'}
                  </span>
                </div>
                {message && (
                  <p className="text-sm" role="status">
                    {message}
                  </p>
                )}
                <details>
                  <summary className="min-h-8 cursor-pointer text-sm">Example recipients</summary>
                  <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4.5 text-sm">
                    {catalog.data.recipients.map((r) => (
                      <li key={`${r.bankCode}-${r.accountNumber}`}>
                        <span className="tabular-nums">
                          {r.bankName} ({r.bankCode}) · {r.accountNumber}
                        </span>{' '}
                        · {r.holderName}
                        <br />
                        <span className="text-muted">{r.note}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="flex flex-wrap gap-4 border-t border-row-divider pt-3 text-sm">
                  <button type="button" className={ui.linkBtn} onClick={expire}>
                    Expire session
                  </button>
                  <button
                    type="button"
                    className={ui.linkBtnDanger}
                    onClick={() => setConfirmReset(true)}
                  >
                    Reset all data…
                  </button>
                </p>
              </>
            )}
          </div>
          <AlertDialog.Root open={confirmReset} onOpenChange={setConfirmReset}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className={ui.dialogOverlay} />
              <AlertDialog.Content className={ui.dialog}>
                <div className={ui.dialogHead}>
                  <AlertDialog.Title asChild>
                    <h2>Reset all demo data?</h2>
                  </AlertDialog.Title>
                </div>
                <div className={ui.dialogBody}>
                  <AlertDialog.Description className="text-sm">
                    All accounts, activity and transfers return to the initial fixtures. Every
                    session is signed out.
                  </AlertDialog.Description>
                  <div className={ui.actionsCenter}>
                    <AlertDialog.Cancel className={ui.btnOutline}>Cancel</AlertDialog.Cancel>
                    <AlertDialog.Action className={ui.btnPrimary} onClick={reset}>
                      Reset data
                    </AlertDialog.Action>
                  </div>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
