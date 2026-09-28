import { cn } from "@/lib/utils";

/** Simplified chat-with-handset glyph used to signal "works on WhatsApp". */
export function WhatsAppIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-5", className)}
      {...props}
    >
      <path
        d="M12 2.75a9.25 9.25 0 0 0-7.98 13.93L2.75 21.25l4.7-1.23A9.25 9.25 0 1 0 12 2.75Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M9.1 7.6c-.25-.55-.5-.56-.74-.57h-.63c-.22 0-.57.08-.87.41-.3.33-1.14 1.11-1.14 2.7s1.17 3.14 1.33 3.35c.16.22 2.26 3.6 5.58 4.9 2.76 1.09 3.32.87 3.92.82.6-.06 1.93-.79 2.2-1.55.27-.76.27-1.41.19-1.55-.08-.14-.3-.22-.63-.38-.33-.16-1.93-.95-2.23-1.06-.3-.11-.52-.16-.74.16-.22.33-.85 1.06-1.04 1.28-.19.22-.38.25-.71.08-.33-.16-1.38-.51-2.63-1.62-.97-.87-1.63-1.94-1.82-2.27-.19-.33-.02-.5.14-.67.15-.15.33-.38.49-.57.16-.19.22-.33.33-.55.11-.22.05-.41-.03-.57-.08-.16-.72-1.77-1.01-2.41Z"
        fill="currentColor"
      />
    </svg>
  );
}
