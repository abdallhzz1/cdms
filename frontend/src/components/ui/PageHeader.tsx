import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className = '' }: PageHeaderProps) {
  return (
    <div className={`mb-5 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {children && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{children}</div>}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, children, className = '' }: SectionHeaderProps) {
  return (
    <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
        {description && <p className="mt-0.5 text-sm leading-5 text-slate-500">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
