import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { ClipboardCheck, Users, Calendar, CheckCircle, XCircle, Clock, AlertCircle, Plus, Send } from 'lucide-react';

type TabKey = 'schedule' | 'attendance' | 'assessments';
type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

const STATUS_MAP: Record<AttendanceStatus, { label_ar: string; label_en: string; icon: any; active: string; inactive: string }> = {
  present:  { label_ar: 'حاضر',  label_en: 'Present', icon: CheckCircle, active: 'bg-emerald-500 text-white', inactive: 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700' },
  absent:   { label_ar: 'غائب',  label_en: 'Absent',  icon: XCircle,     active: 'bg-red-500 text-white',     inactive: 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-700' },
  late:     { label_ar: 'متأخر', label_en: 'Late',    icon: Clock,       active: 'bg-amber-500 text-white',   inactive: 'bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-700' },
  excused:  { label_ar: 'مبرر',  label_en: 'Excused', icon: AlertCircle, active: 'bg-blue-500 text-white',    inactive: 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-700' },
};

export function SupervisorPortalPage() {
  const { locale } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('schedule');

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<number, AttendanceStatus>>({});
  const [selectedSession, setSelectedSession] = useState<number | null>(null);

  // Assessment state
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [assessForm, setAssessForm] = useState({ student_id: '', score: '', max_score: '100', notes: '' });

  // Fetch supervisor assignments (my students)
  const { data: portalData, isLoading, isError } = useQuery({
    queryKey: ['supervisor-portal'],
    queryFn: () => apiFetch<any>('/operational/my-supervisor-assignments'),
  });

  // Fetch sessions for attendance
  const { data: sessionsData } = useQuery({
    queryKey: ['my-sessions', attendanceDate],
    queryFn: () => apiFetch<any>(`/clinical-sessions?date=${attendanceDate}&per_page=20`),
    enabled: activeTab === 'attendance',
  });

  // Fetch my submitted assessments
  const { data: myAssessments } = useQuery({
    queryKey: ['my-assessments'],
    queryFn: () => apiFetch<any>('/clinical-assessments?per_page=25'),
    enabled: activeTab === 'assessments',
  });

  const saveAttendanceMutation = useMutation({
    mutationFn: async () => {
      const promises = Object.entries(attendanceStatuses).map(([studentId, status]) =>
        apiFetch('/attendance-records', {
          method: 'POST',
          body: {
            clinical_session_id: selectedSession,
            student_id: Number(studentId),
            status,
          }
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      setAttendanceStatuses({});
      alert(locale === 'ar' ? 'تم حفظ الحضور بنجاح ✓' : 'Attendance saved successfully ✓');
    }
  });

  const submitAssessmentMutation = useMutation({
    mutationFn: (data: any) => apiFetch('/clinical-assessments', {
      method: 'POST',
      body: {
        ...data,
        clinical_session_id: selectedSession,
        evaluator_person_id: (user as any)?.person?.id,
        status: 'draft',
      }
    }),
    onSuccess: async (data: any) => {
      // Auto-submit after creating
      await apiFetch(`/clinical-assessments/${data?.id ?? data?.data?.id}/submit`, { method: 'POST' });
      queryClient.invalidateQueries({ queryKey: ['my-assessments'] });
      setShowAssessmentForm(false);
      setAssessForm({ student_id: '', score: '', max_score: '100', notes: '' });
    }
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={locale === 'ar' ? 'تعذّر تحميل بيانات بوابة المشرف' : 'Failed to load supervisor portal'} />;

  const isSupervisor = portalData?.meta?.is_supervisor;
  const assignments: any[] = portalData?.data ?? [];
  const supervisorName = portalData?.meta?.full_name_ar || portalData?.meta?.full_name_en || '';

  const sessionsList = Array.isArray(sessionsData) ? sessionsData : sessionsData?.items || [];
  const assessmentsList = Array.isArray(myAssessments) ? myAssessments : myAssessments?.items || [];

  if (!isSupervisor) {
    return (
      <div className="mx-auto max-w-[700px] py-20 text-center space-y-4">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">{locale === 'ar' ? 'ملف المشرف غير موجود' : 'Supervisor Profile Not Found'}</h2>
        <p className="text-slate-500">{locale === 'ar' ? 'حسابك الحالي غير مرتبط بملف مشرف سريري. يرجى مراجعة إدارة النظام.' : 'Your account is not linked to a clinical supervisor profile. Please contact system administration.'}</p>
      </div>
    );
  }

  const TABS: { key: TabKey; label_ar: string; label_en: string; icon: any }[] = [
    { key: 'schedule',    label_ar: 'طلابي',       label_en: 'My Students',   icon: Users },
    { key: 'attendance',  label_ar: 'الحضور',       label_en: 'Attendance',    icon: Calendar },
    { key: 'assessments', label_ar: 'التقييمات',    label_en: 'Assessments',   icon: ClipboardCheck },
  ];

  const handleAssessSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitAssessmentMutation.mutate({
      student_id: Number(assessForm.student_id),
      score: Number(assessForm.score),
      max_score: Number(assessForm.max_score),
      notes: assessForm.notes || null,
    });
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 pb-12">
      {/* Header with supervisor info card */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <PageHeader
            title={locale === 'ar' ? 'بوابة المشرف السريري' : 'Clinical Supervisor Portal'}
            description={supervisorName}
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-2xl border border-emerald-200 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-emerald-700">
            {assignments.length} {locale === 'ar' ? 'طالب معين' : 'Assigned Students'}
          </span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                isActive ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{locale === 'ar' ? tab.label_ar : tab.label_en}</span>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════ TAB: MY STUDENTS (SCHEDULE) ══════════════════════ */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          {!assignments.length ? (
            <div className="py-16 text-center text-slate-500">{locale === 'ar' ? 'لا يوجد طلاب معينون لك حالياً في الدورة الحالية' : 'No students currently assigned to you for this rotation'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                    <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المجموعة' : 'Group'}</th>
                    <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الموقع' : 'Site'}</th>
                    <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الكتلة' : 'Block'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.map((a: any, i: number) => (
                    <tr key={a.id ?? i} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                            {(a.student?.full_name_ar || '?')[0]}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{locale === 'ar' ? a.student?.full_name_ar : a.student?.full_name_en || a.student?.full_name_ar}</div>
                            <div className="text-xs text-slate-500">{a.student?.university_number}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{a.subgroup?.group?.name ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{locale === 'ar' ? a.training_site?.name_ar : a.training_site?.name_en || a.training_site?.name_ar}</td>
                      <td className="px-6 py-4">
                        {a.rotation_block?.block_code ? (
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg">{a.rotation_block.block_code}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB: ATTENDANCE ══════════════════════ */}
      {activeTab === 'attendance' && (
        <div className="space-y-5">
          {/* Session picker */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 mb-4">{locale === 'ar' ? '١. اختر الجلسة' : '1. Select Session'}</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">{locale === 'ar' ? 'التاريخ' : 'Date'}</label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={e => { setAttendanceDate(e.target.value); setSelectedSession(null); }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">{locale === 'ar' ? 'الجلسة' : 'Session'}</label>
                <select
                  value={selectedSession ?? ''}
                  onChange={e => setSelectedSession(Number(e.target.value) || null)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">{locale === 'ar' ? '-- اختر الجلسة --' : '-- Select Session --'}</option>
                  {sessionsList.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.title} — {locale === 'ar' ? s.training_site?.name_ar : s.training_site?.name_en || s.training_site?.name_ar}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Student attendance list */}
          {selectedSession && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">{locale === 'ar' ? '٢. سجّل الحضور' : '2. Take Attendance'}</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {assignments.map((a: any) => {
                  const sid = a.student?.id;
                  const currentStatus = attendanceStatuses[sid];
                  return (
                    <div key={a.id} className="flex items-center gap-4 px-6 py-4">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {(a.student?.full_name_ar || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{locale === 'ar' ? a.student?.full_name_ar : a.student?.full_name_en || a.student?.full_name_ar}</div>
                        <div className="text-xs text-slate-500">{a.student?.university_number}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(Object.keys(STATUS_MAP) as AttendanceStatus[]).map(status => {
                          const s = STATUS_MAP[status];
                          const Icon = s.icon;
                          const isActive = currentStatus === status;
                          return (
                            <button
                              key={status}
                              onClick={() => setAttendanceStatuses(prev => ({ ...prev, [sid]: status }))}
                              title={locale === 'ar' ? s.label_ar : s.label_en}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isActive ? s.active : s.inactive}`}
                            >
                              <Icon className="w-4 h-4" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-5 border-t border-slate-100 flex justify-end">
                <Button
                  onClick={() => saveAttendanceMutation.mutate()}
                  isLoading={saveAttendanceMutation.isPending}
                  disabled={Object.keys(attendanceStatuses).length === 0}
                  className="flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {locale === 'ar' ? 'حفظ الحضور' : 'Save Attendance'}
                </Button>
              </div>
            </div>
          )}

          {!sessionsList.length && (
            <div className="text-center py-10 text-slate-500 text-sm">{locale === 'ar' ? 'لا توجد جلسات مسجلة لهذا التاريخ' : 'No sessions found for this date'}</div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB: ASSESSMENTS ══════════════════════ */}
      {activeTab === 'assessments' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <Button onClick={() => setShowAssessmentForm(!showAssessmentForm)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {locale === 'ar' ? 'تقييم جديد' : 'New Assessment'}
            </Button>
          </div>

          {/* Assessment Form */}
          {showAssessmentForm && (
            <div className="bg-white rounded-3xl border border-indigo-100 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 mb-5">{locale === 'ar' ? 'إضافة تقييم سريري' : 'Add Clinical Assessment'}</h3>
              <form onSubmit={handleAssessSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الطالب' : 'Student'}</label>
                    <select required value={assessForm.student_id} onChange={e => setAssessForm({ ...assessForm, student_id: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500">
                      <option value="">{locale === 'ar' ? '-- اختر الطالب --' : '-- Select Student --'}</option>
                      {assignments.map((a: any) => (
                        <option key={a.student?.id} value={a.student?.id}>
                          {locale === 'ar' ? a.student?.full_name_ar : a.student?.full_name_en || a.student?.full_name_ar}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الجلسة (اختياري)' : 'Session (optional)'}</label>
                    <select value={selectedSession ?? ''} onChange={e => setSelectedSession(Number(e.target.value) || null)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500">
                      <option value="">{locale === 'ar' ? '-- بدون جلسة --' : '-- No Session --'}</option>
                      {sessionsList.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'النتيجة' : 'Score'}</label>
                    <input required type="number" min="0" max={assessForm.max_score} value={assessForm.score}
                      onChange={e => setAssessForm({ ...assessForm, score: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                      placeholder="85" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'النتيجة الكاملة' : 'Max Score'}</label>
                    <input required type="number" min="1" value={assessForm.max_score}
                      onChange={e => setAssessForm({ ...assessForm, max_score: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                  <textarea rows={3} value={assessForm.notes}
                    onChange={e => setAssessForm({ ...assessForm, notes: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                    placeholder={locale === 'ar' ? 'ملاحظات التقييم...' : 'Assessment notes...'} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAssessmentForm(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
                  <Button type="submit" isLoading={submitAssessmentMutation.isPending} className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    {locale === 'ar' ? 'إرسال التقييم' : 'Submit Assessment'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Assessments list */}
          {!assessmentsList.length ? (
            <div className="text-center py-12 text-slate-500 text-sm bg-white rounded-3xl border border-slate-100">
              {locale === 'ar' ? 'لم ترسل أي تقييمات حتى الآن' : 'No assessments submitted yet'}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                      <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'النتيجة' : 'Score'}</th>
                      <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                      <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assessmentsList.map((a: any, i: number) => {
                      const pct = a.score != null && a.max_score ? Math.round((Number(a.score) / Number(a.max_score)) * 100) : null;
                      return (
                        <tr key={a.id ?? i} className="hover:bg-slate-50">
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-slate-900">{locale === 'ar' ? a.student?.full_name_ar : a.student?.full_name_en || a.student?.full_name_ar}</div>
                            <div className="text-xs text-slate-500">{a.student?.university_number}</div>
                          </td>
                          <td className="px-6 py-4">
                            {pct != null ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">{Number(a.score).toFixed(0)} / {Number(a.max_score).toFixed(0)}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${pct >= 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{pct}%</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
                              a.status === 'submitted' ? 'bg-amber-100 text-amber-700' :
                              a.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                              a.status === 'returned' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                            }`}>{a.status}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">{a.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
