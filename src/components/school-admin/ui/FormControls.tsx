import type {
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cloneElement, forwardRef } from "react";

const CONTROL_CLASSES =
  "w-full rounded-[var(--school-admin-radius-control)] border border-[var(--school-admin-border-strong)] bg-[var(--school-admin-surface)] px-3.5 text-sm text-[var(--school-admin-text)] shadow-sm outline-none transition placeholder:text-[var(--school-admin-text-soft)] focus:border-[var(--school-admin-focus)] focus:ring-2 focus:ring-[var(--school-admin-focus-soft)] disabled:cursor-not-allowed disabled:bg-[var(--school-admin-surface-muted)] disabled:text-[var(--school-admin-text-soft)] motion-reduce:transition-none aria-[invalid=true]:border-[var(--school-admin-danger)] aria-[invalid=true]:focus:ring-[var(--school-admin-danger-soft)]";

type SchoolAdminInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  leadingIcon?: ReactNode;
};

export const SchoolAdminInput = forwardRef<HTMLInputElement, SchoolAdminInputProps>(function SchoolAdminInput({
  leadingIcon,
  className = "",
  ...props
}, ref) {
  return (
    <div className="relative">
      {leadingIcon ? (
        <span
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[var(--school-admin-text-soft)]"
          aria-hidden="true"
        >
          {leadingIcon}
        </span>
      ) : null}
      <input
        ref={ref}
        className={`${CONTROL_CLASSES} h-10 ${leadingIcon ? "pl-10" : ""} ${className}`}
        {...props}
      />
    </div>
  );
});

export function SchoolAdminSelect({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL_CLASSES} h-10 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function SchoolAdminTextarea({
  className = "",
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={`${CONTROL_CLASSES} min-h-24 resize-y py-2.5 ${className}`}
      {...props}
    />
  );
}

type SchoolAdminFormFieldProps = {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactElement<{
    id?: string;
    required?: boolean;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
};

export function SchoolAdminFormField({
  id,
  label,
  description,
  error,
  required = false,
  children,
}: SchoolAdminFormFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [
    children.props["aria-describedby"],
    descriptionId,
    errorId,
  ]
    .filter(Boolean)
    .join(" ");
  const control = cloneElement(children, {
    id,
    required: children.props.required ?? required,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : children.props["aria-invalid"],
  });

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-[var(--school-admin-text)]">
        {label}
        {required ? (
          <span className="ml-1 text-[var(--school-admin-danger)]" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">(obligatoire)</span> : null}
      </label>
      {description ? (
        <p id={descriptionId} className="text-xs leading-5 text-[var(--school-admin-text-muted)]">
          {description}
        </p>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-[var(--school-admin-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
