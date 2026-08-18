import { useState, type ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function MainLayout({ children }: { children: ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header onToggleMobileNav={() => setIsMobileNavOpen(prev => !prev)} />
      <div className="flex flex-1 relative">
        <Sidebar 
          isOpenMobile={isMobileNavOpen} 
          onCloseMobile={() => setIsMobileNavOpen(false)} 
        />
        <main className="flex-1 w-full min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
