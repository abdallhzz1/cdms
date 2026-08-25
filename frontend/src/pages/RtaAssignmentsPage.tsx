import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { Users, Check, Lock, Unlock, AlertCircle } from 'lucide-react';

interface RTAUser {
  id: number;
  name: string;
  email: string;
  assigned_levels: string[] | null;
  is_active: boolean;
  roles: string[];
  student_count: number;
  course_count: number;
}

const COHORT_LEVELS = [
  { key: 'fourth', labelAr: 'السنة الرابعة', labelEn: '4th Year' },
  { key: 'fifth',  labelAr: 'السنة الخامسة', labelEn: '5th Year' },
  { key: 'sixth',  labelAr: 'السنة السادسة', labelEn: '6th Year' },
];

export function RtaAssignmentsPage() {
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingLevels, setPendingLevels] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['rta-list'],
    queryFn: () => apiFetch<any>('/users/rta-list'),
  });

  const users: RTAUser[] = Array.isArray(data) ? data : (data?.data ?? []);

  const mutation = useMutation({
    mutationFn: ({ userId, levels }: { userId: number; levels: string[] | null }) =>
      apiFetch('/users/' + userId + '/assign-levels', {
        method: 'PUT',
        body: { assigned_levels: levels && levels.length > 0 ? levels : null },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rta-list'] });
      setEditingId(null);
      setPendingLevels([]);
      setSavingId(null);
      setErrorMessage('');
    },
    onError: error => {
      setSavingId(null);
      setErrorMessage(error instanceof ApiError ? error.message : (locale === 'ar' ? 'تعذر حفظ التكليف.' : 'Could not save assignment.'));
    },
  });

  const startEdit = (u: RTAUser) => {
    setEditingId(u.id);
    setPendingLevels(u.assigned_levels ?? []);
  };

  const toggleLevel = (key: string) => {
    setPendingLevels(prev =>
      prev.includes(key) ? prev.filter(l => l !== key) : [...prev, key]
    );
  };

  const saveAssignment = (userId: number) => {
    setSavingId(userId);
    mutation.mutate({ userId, levels: pendingLevels.length > 0 ? pendingLevels : null });
  };

  const getRoleLabel = (roles: string[]) => {
    if (roles.includes('RTA')) return locale === 'ar' ? 'مساعد بحث وتدريس' : 'Research & Teaching Assistant';
    if (roles.includes('CLINICAL_SUPERVISOR')) return locale === 'ar' ? 'طبيب / مشرف سريري' : 'Clinical Supervisor';
    return roles[0];
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900">
          {locale === 'ar' ? 'تخصيص الدفعات لمساعدي البحث والتدريس' : 'Assign Cohorts to RTA'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {locale === 'ar'
            ? 'حدد الدفعات الدراسية التي يحق لكل مساعد بحث وتدريس إدخال علاماتها.'
            : 'Define which academic cohorts each RTA can grade.'}
        </p>
      </div>

      {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-slate-400">
            <div className="w-9 h-9 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-bold">{locale === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
          </div>
        ) : isError ? (
          <div className="p-16 text-center text-sm font-bold text-red-600">{locale === 'ar' ? 'تعذر تحميل تكليفات المساعدين. تحقق من الصلاحية ثم أعد المحاولة.' : 'Could not load RTA assignments. Check your permission and retry.'}</div>
        ) : users.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">
              {locale === 'ar' ? 'لا يوجد مساعدو بحث وتدريس في النظام بعد.' : 'No RTA found.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map(u => (
              <div key={u.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-black text-sm border border-teal-100 shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10.5px] font-bold">
                      {getRoleLabel(u.roles)}
                    </span>
                    {u.assigned_levels && u.assigned_levels.length > 0 ? (
                      u.assigned_levels.map(l => {
                        const tab = COHORT_LEVELS.find(c => c.key === l);
                        return (
                          <span key={l} className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[10.5px] font-bold border border-teal-200">
                            {locale === 'ar' ? tab?.labelAr : tab?.labelEn}
                          </span>
                        );
                      })
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10.5px] font-bold border border-amber-200 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {locale === 'ar' ? 'غير محدد — لا يرى طلاب' : 'Not assigned'}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[10.5px] font-bold border border-slate-200">
                      {u.student_count} {locale === 'ar' ? 'طالب' : 'students'} · {u.course_count} {locale === 'ar' ? 'مساق' : 'courses'}
                    </span>
                  </div>
                </div>

                {editingId === u.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                      {COHORT_LEVELS.map(lvl => (
                        <button
                          key={lvl.key}
                          type="button"
                          onClick={() => toggleLevel(lvl.key)}
                          className={'px-3 py-1.5 rounded-2xl text-xs font-black border transition-all cursor-pointer flex items-center gap-1.5 ' + (
                            pendingLevels.includes(lvl.key)
                              ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          )}
                        >
                          {pendingLevels.includes(lvl.key) && <Check className="w-3 h-3" />}
                          {locale === 'ar' ? lvl.labelAr : lvl.labelEn}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setPendingLevels([]); }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 cursor-pointer"
                      >
                        {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                      </button>
                      <button
                        type="button"
                        disabled={savingId === u.id}
                        onClick={() => saveAssignment(u.id)}
                        className="px-3 py-1.5 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 cursor-pointer disabled:opacity-60"
                      >
                        {savingId === u.id ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ التخصيص' : 'Save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(u)}
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer shrink-0"
                  >
                    {u.assigned_levels && u.assigned_levels.length > 0
                      ? <><Unlock className="w-3.5 h-3.5" /> {locale === 'ar' ? 'تعديل التخصيص' : 'Edit'}</>
                      : <><Lock className="w-3.5 h-3.5 text-amber-600" /> {locale === 'ar' ? 'تخصيص دفعة' : 'Assign Cohort'}</>
                    }
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
