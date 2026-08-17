import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Search, Bell, Menu } from 'lucide-react';

export function Header() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="z-20 bg-white text-slate-900 shadow-sm border-b border-slate-100">
      <div className="flex h-[80px] items-center justify-between px-6 lg:px-8">
        
        {/* Left Logo Section */}
        <div className="flex items-center gap-3 w-64 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20 shrink-0">
            H
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold tracking-tight text-slate-900">{t('common.appName', 'CDMS')}</h1>
          </div>
        </div>

        {/* Center Search Bar */}
        <div className="hidden flex-1 max-w-xl mx-4 sm:flex items-center bg-slate-50 rounded-full px-4 py-2.5 border border-slate-100 focus-within:border-indigo-600 focus-within:ring-1 focus-within:ring-indigo-600 transition-all">
          <Search className="w-5 h-5 text-slate-400" />
          <input 
            type="text" 
            placeholder={t('common.search', 'البحث هنا...')}
            className="bg-transparent border-none outline-none w-full px-3 text-sm font-medium text-slate-700 placeholder-slate-400"
          />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-5">
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} className="sm:hidden text-slate-500">
            <Menu className="w-6 h-6" />
          </button>
          
          <LanguageSwitcher />

          <button className="relative p-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border border-white"></span>
          </button>

          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200 cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-colors" onClick={logout}>
              <div className="text-end hidden sm:block">
                <p className="text-sm font-bold text-slate-900">{user.name}</p>
                <p className="text-xs font-medium text-slate-500">
                  {user.roles && user.roles.length > 0 ? user.roles[0].replace(/_/g, ' ') : 'Admin'}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-slate-200 overflow-hidden shrink-0 border border-slate-100">
                <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=e0dffd&color=5c59e8`} alt="Avatar" className="h-full w-full object-cover" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-slate-100 p-4">
          <div className="bg-slate-50 rounded-full px-4 py-2 flex items-center mb-4">
            <Search className="w-5 h-5 text-slate-400" />
            <input type="text" placeholder={t('common.search', 'البحث هنا...')} className="bg-transparent border-none outline-none w-full px-3 text-sm" />
          </div>
        </div>
      )}
    </header>
  );
}