"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { PenLine, Send } from "lucide-react";

import { ActionForm, SubmitButton, useFieldError, type FormText } from "@/components/app/form";
import { firstGap, type QuickReply, type QuickReplyKey } from "@/lib/conversations/quick-replies";
import { sendWhatsAppMessage } from "@/lib/actions/whatsapp";

type Labels = { label: string; placeholder: string; send: string; takesOver: string };
export type QuickReplyLabels = { title: string; sendsNow: string; draft: string; labels: Record<QuickReplyKey, string> };

function MessageInput({ labels, inputRef }: { labels: Labels; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const error = useFieldError("text");
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor="composer-text" className="sr-only">
        {labels.label}
      </label>
      <textarea
        ref={inputRef}
        id="composer-text"
        name="text"
        rows={2}
        maxLength={4096}
        required
        placeholder={labels.placeholder}
        aria-invalid={error ? true : undefined}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter adds a line (like WhatsApp Web).
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className="max-h-40 min-h-11 w-full resize-y rounded-2xl border border-input bg-card px-3.5 py-2.5 text-[0.9375rem] text-deep outline-none focus-visible:border-waza-500 focus-visible:ring-4 focus-visible:ring-waza-500/15"
      />
      {error ? (
        <p role="alert" className="text-xs font-medium text-coral-700">
          {error}
        </p>
      ) : (
        <p className="text-[0.6875rem] text-slate">{labels.takesOver}</p>
      )}
    </div>
  );
}

/**
 * The quick replies, in a strip that scrolls sideways above the reply box. A
 * complete reply is sent on tap (the same Server Action as Send, with all its
 * checks); a draft goes into the box with its [gap] selected, to fill in.
 */
function QuickReplies({ replies, labels, inputRef }: { replies: QuickReply[]; labels: QuickReplyLabels; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const { pending } = useFormStatus();
  const use = (r: QuickReply) => {
    const box = inputRef.current;
    if (!box) return;
    if (r.send) {
      box.value = r.text;
      box.form?.requestSubmit();
      return;
    }
    const before = box.value.trim();
    box.value = before ? `${before}\n${r.text}` : r.text;
    box.focus();
    const gap = firstGap(box.value.slice(before ? before.length + 1 : 0));
    const offset = before ? before.length + 1 : 0;
    if (gap) box.setSelectionRange(offset + gap.start, offset + gap.end);
    else box.setSelectionRange(box.value.length, box.value.length);
  };
  const sendsId = "quick-reply-sends";
  const draftId = "quick-reply-draft";
  return (
    <div role="group" aria-label={labels.title} className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" data-testid="quick-replies">
      {/* What a tap does, read as each chip's description (not part of its name). */}
      <span id={sendsId} hidden>
        {labels.sendsNow}
      </span>
      <span id={draftId} hidden>
        {labels.draft}
      </span>
      {replies.map((r) => {
        const Icon = r.send ? Send : PenLine;
        return (
          <button
            key={r.key}
            type="button"
            disabled={pending}
            onClick={() => use(r)}
            title={r.send ? labels.sendsNow : labels.draft}
            aria-describedby={r.send ? sendsId : draftId}
            data-quick-reply={r.key}
            data-sends={r.send ? "true" : "false"}
            className="inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-full border border-waza-200 bg-mint px-3.5 text-sm font-semibold whitespace-nowrap text-deep hover:border-waza-500 disabled:opacity-60"
          >
            <Icon className="size-3.5 text-waza-700" aria-hidden />
            {labels.labels[r.key]}
          </button>
        );
      })}
    </div>
  );
}

/** Reply box: sends through the business's WhatsApp number (Server Action), then clears. */
export function Composer({
  conversationId,
  labels,
  text,
  quickReplies,
  quickReplyLabels,
}: {
  conversationId: string;
  labels: Labels;
  text: FormText;
  quickReplies?: QuickReply[];
  quickReplyLabels?: QuickReplyLabels;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  return (
    <ActionForm action={sendWhatsAppMessage} text={text} hidden={{ conversation_id: conversationId }} resetOnSuccess successMessage={null} className="gap-2">
      {quickReplies?.length && quickReplyLabels ? <QuickReplies replies={quickReplies} labels={quickReplyLabels} inputRef={inputRef} /> : null}
      <div className="flex items-start gap-2">
        <MessageInput labels={labels} inputRef={inputRef} />
        <SubmitButton className="h-11 shrink-0">
          <Send aria-hidden /> {labels.send}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
