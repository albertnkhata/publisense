import { useState, type KeyboardEvent } from 'react';
import { REPORT_DETAILS_MAX, REPORT_REASONS, reportError, reportText, useReport, type ReportReason, type ReportTarget } from '../api';
import { cx } from '../lib/cx';
import { Button, Dialog, Field, Icon, Textarea, useToast } from '../ui';

/**
 * ReportDialog (FOUNDATION §5): pick a reason, add details if you like. Reports go
 * to the Publisense team (platform admins), never to the board's team, so the
 * toast keeps the mockup's wording: "Thanks, our team will review this …".
 */
const NOUN: Record<ReportTarget, string> = { post: 'post', reply: 'reply', user: 'account' };

export function ReportDialog({ target, id, open, onClose, subject }: { target: ReportTarget; id: string; open: boolean; onClose: () => void; subject?: string }) {
  const { toast } = useToast();
  const report = useReport();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const noun = NOUN[target];

  const submit = () => {
    const problem = reportError(reason, details);
    if (problem || !reason) return setError(problem);
    setError(null);
    report.mutate(
      { target, id, reason: reportText(reason, details) },
      {
        onSuccess: (r) => {
          toast(r === 'already' ? `You already reported this ${noun}. Our team will review it.` : `Thanks, our team will review this ${noun}`);
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'We couldn’t send your report. Try again.'),
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const values = REPORT_REASONS.map((r) => r.value);
    const i = reason ? values.indexOf(reason) : -1;
    const next = values[(i + (e.key === 'ArrowDown' ? 1 : -1) + values.length) % values.length] ?? 'spam';
    setReason(next);
    (e.currentTarget.querySelector(`[data-reason="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Report ${noun}`}
      description="Reports go to the Publisense team, not to the board’s team."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={report.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={report.isPending}>
            Send report
          </Button>
        </>
      }
    >
      {subject ? <p className="mt-0 mb-3 line-clamp-2 text-base font-semibold text-ink">{subject}</p> : null}
      <div role="radiogroup" aria-label="Reason" className="mb-4 flex flex-col gap-1" onKeyDown={onKeyDown}>
        {REPORT_REASONS.map((r, i) => {
          const on = r.value === reason;
          return (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (!reason && i === 0) ? 0 : -1}
              data-reason={r.value}
              onClick={() => {
                setReason(r.value);
                setError(null);
              }}
              className={cx(
                'flex items-center gap-3 rounded-md border px-3 py-2 text-left text-base text-ink transition-colors duration-120',
                on ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:bg-subtle',
              )}
            >
              <span className="font-medium">{r.label}</span>
              {on ? (
                <span className="ml-auto text-brand">
                  <Icon name="check" size={14} strokeWidth={2.4} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <Field label="Anything we should know?" optional={reason !== 'other'} error={error} aside={`${details.trim().length}/${REPORT_DETAILS_MAX}`}>
        <Textarea rows={3} value={details} maxLength={REPORT_DETAILS_MAX + 50} onChange={(e) => setDetails(e.target.value)} />
      </Field>
    </Dialog>
  );
}
