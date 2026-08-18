import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Save } from 'lucide-react';

export function AdvisingAssignmentsPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const [pendingChanges, setPendingChanges] = useState<Record<number, number>>({});

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['students-for-assignment'],
    queryFn: () => apiFetch<any>(`/students?per_page=100`)
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => apiFetch<any>(`/users/lookup`)
  });

  const updateMutation = useMutation({
    mutationFn: async (changes: Record<number, number>) => {
      // Execute a sequential update since we don't have a bulk endpoint
      for (const [studentId, advisorId] of Object.entries(changes)) {
        await apiFetch(`/students/${studentId}`, {
          method: 'PUT',
          body: { academic_advisor_id: advisorId }
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students-for-assignment'] });
      setPendingChanges({});
    }
  });

  if (!can('advising.manage')) return <ErrorState title="Access Denied" />;
  if (studentsLoading || usersLoading) return <LoadingState />;

  const studentsList = Array.isArray(students) ? students : students?.items || [];
  const advisorsList = Array.isArray(users) ? users : users?.data || [];

  const handleAdvisorChange = (studentId: number, advisorId: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [studentId]: Number(advisorId)
    }));
  };

  const handleSaveAll = () => {
    if (Object.keys(pendingChanges).length === 0) return;
    updateMutation.mutate(pendingChanges);
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader 
          title={locale === 'ar' ? 'تعيين المرشدين الأكاديميين' : 'Advisor Assignments'} 
          description={locale === 'ar' ? 'قم بربط الطلاب بمرشديهم الأكاديميين' : 'Assign students to their academic advisors'} 
        />
        <Button 
          onClick={handleSaveAll} 
          disabled={!hasChanges} 
          isLoading={updateMutation.isPending}
          className="flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes'}
        </Button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الرقم الجامعي' : 'ID'}</th>
                <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المستوى' : 'Level'}</th>
                <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المرشد الأكاديمي' : 'Academic Advisor'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {studentsList.map((s: any) => {
                const currentAdvisorId = pendingChanges[s.id] !== undefined ? pendingChanges[s.id] : s.academic_advisor_id || '';
                const isChanged = pendingChanges[s.id] !== undefined && pendingChanges[s.id] !== s.academic_advisor_id;

                return (
                  <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isChanged ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-500">{s.university_number}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">{locale === 'ar' ? s.full_name_ar : s.full_name_en || s.full_name_ar}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{s.academic_level}</td>
                    <td className="px-6 py-4">
                      <select 
                        value={currentAdvisorId} 
                        onChange={(e) => handleAdvisorChange(s.id, e.target.value)}
                        className={`w-full max-w-xs rounded-xl border px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 ${isChanged ? 'border-amber-400 focus:border-amber-500' : 'border-slate-200 focus:border-indigo-500'}`}
                      >
                        <option value="">{locale === 'ar' ? '-- بدون مرشد --' : '-- No Advisor --'}</option>
                        {advisorsList.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {!studentsList.length && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">{locale === 'ar' ? 'لا يوجد طلاب' : 'No students found.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
