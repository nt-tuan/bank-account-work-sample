import { ui } from '@/shared/ui/classes.ts';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

export function LeaveTransferDialog({
  blocked,
  leave,
  keepEditing,
}: {
  blocked: boolean;
  leave: () => void;
  keepEditing: () => void;
}) {
  return (
    <AlertDialog.Root
      open={blocked}
      onOpenChange={(open) => {
        if (!open) keepEditing();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={ui.dialogOverlay} />
        <AlertDialog.Content className={ui.dialog}>
          <div className={ui.dialogHead}>
            <AlertDialog.Title asChild>
              <h2>Leave this transfer?</h2>
            </AlertDialog.Title>
          </div>
          <div className={ui.dialogBody}>
            <AlertDialog.Description className="text-sm">
              The details you entered will be discarded. Nothing has been sent.
            </AlertDialog.Description>
            <div className={ui.actionsCenter}>
              <AlertDialog.Action className={ui.btnOutline} onClick={leave}>
                Leave
              </AlertDialog.Action>
              <AlertDialog.Cancel className={ui.btnPrimary}>Keep editing</AlertDialog.Cancel>
            </div>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
