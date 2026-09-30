/* eslint-disable @next/next/no-img-element -- media comes from short-lived signed URLs; next/image would cache them. */
import { FileText, Film, Image as ImageIcon, MapPin, Mic, TriangleAlert } from "lucide-react";

import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { languageName } from "@/lib/i18n/languages";
import { mapsUrl, type MessageView } from "@/lib/messaging/views";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

/**
 * Body of one message in the dashboard conversation view, for every message
 * type: text, voice note (player + transcript shown separately), image,
 * document, video and shared location. Used inside ChatBubble.
 */
export function MessageContent({
  message,
  t,
  locale,
}: {
  message: MessageView;
  t: Messages["dashboard"]["messageContent"];
  locale: Locale;
}) {
  const muted = message.sender === "ai" ? "text-cream/70" : "text-slate";
  const unavailable = <p className={cn("text-xs italic", muted)}>{t.mediaUnavailable}</p>;
  const notProcessed =
    message.direction === "inbound" && message.processingStatus === "unsupported" && message.type !== "text" ? (
      <p className={cn("mt-1.5 flex items-center gap-1 text-[0.6875rem]", muted)}>
        <TriangleAlert className="size-3" aria-hidden /> {t.notProcessed}
      </p>
    ) : null;

  switch (message.type) {
    case "text":
      return <p className="whitespace-pre-line">{message.text}</p>;

    case "audio": {
      const tr = message.transcript;
      return (
        <div className="flex min-w-56 flex-col gap-2">
          <Label icon={<Mic className="size-3.5" aria-hidden />} text={message.media?.isVoice ? t.voiceNote : t.audioFile} className={muted} />
          {message.media?.signedUrl ? (
            <audio controls preload="none" src={message.media.signedUrl} className="h-9 w-full max-w-72">
              <track kind="captions" />
            </audio>
          ) : (
            unavailable
          )}
          <div className="rounded-lg bg-black/5 px-2.5 py-2">
            <p className={cn("text-[0.6875rem] font-semibold uppercase tracking-wider", muted)}>{t.transcript}</p>
            {tr?.status === "completed" && tr.text ? (
              <>
                <p className="mt-0.5 whitespace-pre-line" lang={tr.language ?? undefined}>
                  {tr.text}
                </p>
                {tr.language ? (
                  <p className={cn("mt-1 text-[0.6875rem]", muted)}>{format(t.detectedLanguage, { language: languageName(tr.language, locale) })}</p>
                ) : null}
              </>
            ) : (
              <p className={cn("mt-0.5 text-xs italic", muted)}>
                {tr?.status === "pending" ? t.transcriptPending : tr?.status === "failed" ? t.transcriptFailed : t.transcriptUnavailable}
              </p>
            )}
          </div>
          {notProcessed}
        </div>
      );
    }

    case "image":
      return (
        <div className="flex flex-col gap-1.5">
          {message.media?.signedUrl ? (
            <a href={message.media.signedUrl} target="_blank" rel="noreferrer noopener" className="block">
              <img src={message.media.signedUrl} alt={message.text ?? t.image} className="max-h-72 max-w-full rounded-lg object-contain" />
            </a>
          ) : (
            <>
              <Label icon={<ImageIcon className="size-3.5" aria-hidden />} text={t.image} className={muted} />
              {unavailable}
            </>
          )}
          {message.text ? <p className="whitespace-pre-line">{message.text}</p> : null}
          {notProcessed}
        </div>
      );

    case "document":
    case "video":
      return (
        <div className="flex flex-col gap-1.5">
          <Label
            icon={message.type === "video" ? <Film className="size-3.5" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}
            text={message.media?.filename ?? (message.type === "video" ? t.video : t.document)}
            className={muted}
          />
          {message.media?.signedUrl ? (
            message.type === "video" ? (
              <video controls preload="none" src={message.media.signedUrl} className="max-h-72 max-w-full rounded-lg" />
            ) : (
              <a href={message.media.signedUrl} target="_blank" rel="noreferrer noopener" className="text-sm font-semibold underline">
                {t.download}
              </a>
            )
          ) : (
            unavailable
          )}
          {message.text ? <p className="whitespace-pre-line">{message.text}</p> : null}
          {notProcessed}
        </div>
      );

    case "location":
      return (
        <div className="flex flex-col gap-1">
          <Label icon={<MapPin className="size-3.5" aria-hidden />} text={t.location} className={muted} />
          {message.location ? (
            <>
              {message.location.name ? <p className="font-semibold">{message.location.name}</p> : null}
              {message.location.address ? <p>{message.location.address}</p> : null}
              <a href={mapsUrl(message.location)} target="_blank" rel="noreferrer noopener" className="text-sm font-semibold underline">
                {t.openMap}
              </a>
            </>
          ) : (
            unavailable
          )}
          {notProcessed}
        </div>
      );
  }
}

function Label({ icon, text, className }: { icon: React.ReactNode; text: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs font-semibold", className)}>
      {icon}
      {text}
    </p>
  );
}
