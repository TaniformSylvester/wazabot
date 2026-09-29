import { FormAlert } from "@/components/auth/form-alert";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      <h1 className="type-h2">{title}</h1>
      {description ? <p className="type-body mt-2 text-slate">{description}</p> : null}
      <div className="mt-8">{children}</div>
      {footer ? <div className="mt-8 border-t border-border pt-6 text-center text-sm text-slate">{footer}</div> : null}
    </div>
  );
}

export function NotConfiguredNotice({ text }: { text: string }) {
  return (
    <FormAlert tone="info" className="mb-6">
      {text}
    </FormAlert>
  );
}
