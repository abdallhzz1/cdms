import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className = '' }: PageHeaderProps) {
  return (
    <div className={`mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="space-y-1">
        <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-normal">{title}</h1>
        {description && <p className="text-xs text-slate-500 font-normal leading-relaxed">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
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
    <div className={`mb-3 flex items-center justify-between ${className}`}>
      <div>
        <h2 className="text-sm sm:text-base font-bold text-slate-800">{title}</h2>
        {description && <p className="text-xs text-slate-500 font-normal">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
