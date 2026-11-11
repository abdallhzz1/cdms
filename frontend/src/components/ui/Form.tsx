import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ children, className = '', required, ...props }: LabelProps) {
  return (
    <label className={`mb-2 block text-sm font-bold text-slate-700 ${className}`} {...props}>
      {children}
      {required && <span aria-hidden="true" className="ms-1 text-rose-700">*</span>}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function Input({ className = '', error, ...props }: InputProps) {
  return (
    <div className="w-full">
      <input
        aria-invalid={Boolean(error)}
        className={`block min-h-11 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500
        ${error ? 'border-rose-700 focus:border-rose-700 focus:ring-rose-700/20' : 'border-slate-300 focus:border-teal-600 focus:ring-teal-600/20'}
        ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export function Select({ className = '', error, children, ...props }: SelectProps) {
  return (
    <div className="w-full">
      <select
        aria-invalid={Boolean(error)}
        className={`block min-h-11 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500
        ${error ? 'border-rose-700 focus:border-rose-700 focus:ring-rose-700/20' : 'border-slate-300 focus:border-teal-600 focus:ring-teal-600/20'}
        ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}
