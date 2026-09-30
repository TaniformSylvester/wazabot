"use client";

import { useRef } from "react";
import { Send } from "lucide-react";

import { ActionForm, SubmitButton, useFieldError, type FormText } from "@/components/app/form";
import { sendWhatsAppMessage } from "@/lib/actions/whatsapp";

type Labels = { label: string; placeholder: string; send: string; takesOver: string };

function MessageInput({ labels }: { labels: Labels }) {
  const error = useFieldError("text");
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor="composer-text" className="sr-only">
        {labels.label}
      </label>
      <textarea
        ref={ref}
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

/** Reply box: sends through the business's WhatsApp number (Server Action), then clears. */
export function Composer({ conversationId, labels, text }: { conversationId: string; labels: Labels; text: FormText }) {
  return (
    <ActionForm action={sendWhatsAppMessage} text={text} hidden={{ conversation_id: conversationId }} resetOnSuccess successMessage={null} className="gap-2">
      <div className="flex items-start gap-2">
        <MessageInput labels={labels} />
        <SubmitButton className="h-11 shrink-0">
          <Send aria-hidden /> {labels.send}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
