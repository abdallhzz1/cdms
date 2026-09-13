import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { 
  Bell, Menu, LogOut, Shield, ChevronDown, 
  User as UserIcon, CheckCheck, ListTodo, Mail, CalendarDays, AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { notificationText, relativeNotificationTime, type LocalNotification } from '@/features/notifications/types';

interface HeaderProps {
  onToggleMobileNav?: () => void;
}

export function Header({ onToggleMobileNav }: HeaderProps) {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  // Dropdown states
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleLabel = (roles?: any[]) => {
    const roleCodes = (roles || []).map(r => typeof r === 'string' ? r.toUpperCase() : String(r.code || r.name || '').toUpperCase());

    const isDeptHead = roleCodes.includes('DEPARTMENT_HEAD');
    const isClinicalDirector = roleCodes.includes('CLINICAL_DIRECTOR');
    const isSupervisor = roleCodes.includes('CLINICAL_SUPERVISOR');

    if (isClinicalDirector && isSupervisor) {
      return locale === 'ar' ? 'مدير الدائرة & مشرف سريري' : 'Clinical Director & Supervisor';
    }

    if (isDeptHead && isSupervisor) {
      return locale === 'ar' ? 'رئيس قسم & مشرف سريري' : 'Dept Head & Supervisor';
    }

    if (isDeptHead) {
      return locale === 'ar' ? 'رئيس قسم سريري' : 'Department Head';
    }

    const map: Record<string, { ar: string; en: string }> = {
      CLINICAL_DIRECTOR: { ar: 'مدير الدائرة السريرية', en: 'Clinical Director' },
      DEAN: { ar: 'عميد كلية الطب', en: 'Dean of Medicine' },
      VICE_DEAN: { ar: 'نائب العميد', en: 'Vice Dean' },
      DEPARTMENT_HEAD: { ar: 'رئيس قسم سريري', en: 'Department Head' },
      ACADEMIC_ADVISOR: { ar: 'مرشد أكاديمي', en: 'Academic Advisor' },
      CLINICAL_SUPERVISOR: { ar: 'مشرف سريري', en: 'Clinical Supervisor' },
      STUDENT: { ar: 'طالب سريري', en: 'Clinical Student' },
      ADMIN_ASSISTANT: { ar: 'مساعد إداري', en: 'Admin Assistant' },
      SYSTEM_ADMIN: { ar: 'مدير النظام', en: 'System Administrator' },
      SYS_ADMIN: { ar: 'مدير النظام', en: 'System Administrator' },
      RTA: { ar: 'مساعد تدريس وبحث', en: 'RTA' }
    };

    const rolePriority = [
      'SYS_ADMIN', 'SYSTEM_ADMIN', 'DEAN', 'VICE_DEAN', 
      'CLINICAL_DIRECTOR', 'DEPARTMENT_HEAD', 'ADMIN_ASSISTANT', 
      'ACADEMIC_ADVISOR', 'CLINICAL_SUPERVISOR', 'RTA', 'STUDENT'
    ];

    const sorted = [...roleCodes].sort((a, b) => {
      const ia = rolePriority.indexOf(a);
      const ib = rolePriority.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const primaryRole = sorted[0];
    if (!primaryRole) return locale === 'ar' ? 'مستخدم النظام' : 'System User';
    return map[primaryRole] ? (locale === 'ar' ? map[primaryRole].ar : map[primaryRole].en) : primaryRole.replace(/_/g, ' ');
  };

  const roleLabel = getRoleLabel(user?.roles);

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications', 'header'],
    queryFn: () => apiFetch<LocalNotification[]>('/notifications?per_page=8'),
    enabled: Boolean(user),
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });
  const { data: unread = { count: 0 } } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => apiFetch<{ count: number }>('/notifications/unread-count'),
    enabled: Boolean(user),
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });
  const refreshNotifications = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
    ]);
  };
  const markRead = useMutation({ mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }), onSuccess: refreshNotifications });
  const markAllRead = useMutation({ mutationFn: () => apiFetch('/notifications/read-all', { method: 'POST' }), onSuccess: refreshNotifications });
  const openNotification = async (item: LocalNotification) => {
    if (!item.read_at) await markRead.mutateAsync(item.id);
    setIsNotifOpen(false);
    if (item.action_url) navigate(item.action_url);
  };
  const categoryIcon = (item: LocalNotification) => item.severity === 'urgent' ? AlertTriangle : item.category === 'tasks' ? ListTodo : item.category === 'correspondence' ? Mail : item.category === 'distribution' ? CalendarDays : Bell;
  const unreadCount = unread.count;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-3 sm:px-5 lg:px-7">
        
        {/* ========================================================================= */}
        {/* START SIDE: Mobile Menu Button & University Branding */}
        {/* ========================================================================= */}
        <div className="flex min-w-0 items-center gap-2.5">
          <button 
            type="button" 
            onClick={onToggleMobileNav} 
            className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-teal-700 md:hidden"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-800">{locale === 'ar' ? 'مساحة العمل' : 'Workspace'}</p>
            <p className="hidden truncate text-[10px] font-bold text-slate-500 sm:block">{roleLabel}</p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* END SIDE: Language Switcher + Notifications Popover + User Profile Dropdown */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-1.5">
          
          {/* 1. Language Switcher */}
          <LanguageSwitcher />

          {/* 2. Notifications Popover */}
          <div className="relative" ref={notifRef}>
            <button 
              type="button"
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className={`relative rounded-xl p-2 transition-colors ${
                isNotifOpen 
                  ? 'bg-teal-50 text-teal-700' 
                  : 'text-slate-500 hover:text-teal-600 hover:bg-slate-100'
              }`}
              title={locale === 'ar' ? 'الإشعارات والتنبيهات' : 'Notifications'}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal-500 ring-2 ring-white"></span>
              )}
            </button>

            {/* Notifications Dropdown Panel */}
            {isNotifOpen && (
              <div className="absolute left-0 rtl:left-0 rtl:right-auto ltr:right-0 ltr:left-auto top-full mt-2 w-80 sm:w-96 rounded-3xl bg-white shadow-2xl border border-slate-100 p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs text-slate-800">
                      {locale === 'ar' ? 'الإشعارات والتنبيهات' : 'Notifications'}
                    </h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700">
                        {unreadCount} {locale === 'ar' ? 'جديد' : 'new'}
                      </span>
                    )}
                  </div>

                  {unreadCount > 0 && (
                    <button 
                      onClick={() => markAllRead.mutate()}
                      disabled={markAllRead.isPending}
                      className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>{locale === 'ar' ? 'تعيين كمقروء' : 'Mark read'}</span>
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                <div className="py-2 space-y-1.5 max-h-80 overflow-y-auto">
                  {notificationsLoading && <p className="py-8 text-center text-xs text-slate-400">{locale === 'ar' ? 'جاري تحميل الإشعارات...' : 'Loading notifications...'}</p>}
                  {!notificationsLoading && notifications.length === 0 && <p className="py-8 text-center text-xs text-slate-400">{locale === 'ar' ? 'لا توجد إشعارات حالياً.' : 'No notifications yet.'}</p>}
                  {notifications.map((item) => {
                    const Icon = categoryIcon(item);
                    const text = notificationText(item, locale);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`w-full p-2.5 rounded-2xl hover:bg-slate-50 transition-colors flex items-start gap-3 text-start ${!item.read_at ? 'bg-teal-50/50' : ''}`}
                        onClick={() => openNotification(item)}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.severity === 'urgent' ? 'text-red-600 bg-red-50' : item.severity === 'action' ? 'text-amber-700 bg-amber-50' : 'text-teal-600 bg-teal-50'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><h4 className="text-xs font-bold text-slate-800 truncate">{text.title}</h4>{!item.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />}</div>
                          <p className="text-[11px] text-slate-500 leading-snug mt-0.5 line-clamp-2">{text.message}</p>
                          <span className="text-[10px] text-slate-400 font-medium block mt-1">{relativeNotificationTime(item.created_at, locale)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="pt-2.5 border-t border-slate-100 text-center">
                  <button 
                    onClick={() => { setIsNotifOpen(false); navigate('/notifications'); }}
                    className="text-xs font-bold text-teal-600 hover:text-teal-700"
                  >
                    {locale === 'ar' ? 'عرض جميع الإشعارات' : 'View all notifications'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. User Profile Dropdown Pill */}
          {user && (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                aria-label={`${user.name} ${roleLabel}`}
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className={`flex items-center gap-2 rounded-xl p-1 transition-colors ${
                  isUserMenuOpen
                    ? 'bg-teal-50'
                    : 'hover:bg-slate-100'
                }`}
              >
                {/* User Avatar Circle */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-teal-600 text-xs font-black text-white">
                  {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : user.name.charAt(0).toUpperCase()}
                </div>

                {/* User Name & Role Label (Desktop) */}
                <div className="hidden text-start lg:block">
                  <p className="max-w-[150px] truncate text-sm font-bold leading-tight text-slate-800">
                    {user.name}
                  </p>
                </div>

                {/* Dropdown Chevron */}
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 hidden md:block transition-transform duration-150 ${isUserMenuOpen ? 'rotate-180 text-teal-600' : ''}`} />
              </button>

              {/* User Dropdown Menu Card */}
              {isUserMenuOpen && (
                <div className="absolute left-0 rtl:left-0 rtl:right-auto ltr:right-0 ltr:left-auto top-full mt-2 w-64 rounded-3xl bg-white shadow-2xl border border-slate-100 p-3 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-2">
                  
                  {/* User Profile Card */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                      {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{user.name}</h4>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-teal-700 mt-0.5">
                        <Shield className="w-3 h-3 text-teal-500 shrink-0" />
                        <span className="truncate">{roleLabel}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate block mt-0.5">{user.email}</span>
                    </div>
                  </div>

                  {/* Links */}
                  <div className="space-y-0.5">
                    <button
                      onClick={() => { setIsUserMenuOpen(false); navigate('/profile'); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-teal-800 hover:bg-teal-50 transition-colors text-start"
                    >
                      <UserIcon className="w-4 h-4 text-teal-600" />
                      <span>{locale === 'ar' ? 'ملفي الشخصي' : 'My Profile'}</span>
                    </button>
                  </div>

                  {/* Divider & Logout */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-colors text-start"
                    >
                      <LogOut className="w-4 h-4 text-red-500" />
                      <span>{locale === 'ar' ? 'تسجيل الخروج من النظام' : 'Sign Out'}</span>
                    </button>
                  </div>

                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </header>
  );
}
