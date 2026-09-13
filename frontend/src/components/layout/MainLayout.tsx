import { useState, type ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function MainLayout({ children }: { children: ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('cdms.sidebar.collapsed') === '1');

  const toggleSidebar = () => setIsSidebarCollapsed(current => {
    localStorage.setItem('cdms.sidebar.collapsed', current ? '0' : '1');
    return !current;
  });

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        isOpenMobile={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onToggleMobileNav={() => setIsMobileNavOpen(prev => !prev)} />
        <main className="w-full min-w-0 flex-1 p-3 sm:p-5 lg:p-7">
          <div className="mx-auto max-w-7xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
