import React, { useState } from 'react';
import { getReportDownloadUrl } from '../api/distribution';
import { apiUrl } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Form';
import { useI18n } from '@/i18n/I18nContext';
import { FileSpreadsheet, Download, BarChart3, Users, Building2, Clock, ClipboardCheck, Mail, Sparkles } from 'lucide-react';

export const ReportsDashboard: React.FC = () => {
  const { locale } = useI18n();
  const [reportType, setReportType] = useState<'students' | 'departments' | 'sites' | 'supervisors' | 'unassigned'>('students');
  const [rotationId, setRotationId] = useState<number>(1);
  const [entityId, setEntityId] = useState<string>('');

  const handleExport = (format: 'excel' | 'csv' | 'pdf') => {
    const url = getReportDownloadUrl(
      reportType,
      entityId ? parseInt(entityId, 10) : undefined,
      { rotation_id: rotationId, format }
    );
    window.open(url, '_blank');
  };

  const reports = [
    { id: 'students', label: locale === 'ar' ? 'الطلبة والتوزيعات' : 'Students & Distributions', desc: locale === 'ar' ? 'تقرير شامل بجميع الطلبة وتعييناتهم السريرية' : 'Comprehensive report of all students and placements' },
    { id: 'unassigned', label: locale === 'ar' ? 'الطلبة غير الموزعين' : 'Unassigned Students', desc: locale === 'ar' ? 'تقرير بالطلبة الذين لم يتم تسكينهم في أي موقع تدريبي' : 'Students not yet assigned to any site' },
    { id: 'departments', label: locale === 'ar' ? 'توزيع الأقسام' : 'Department Distributions', desc: locale === 'ar' ? 'تقرير مفصل بالتوزيع الخاص بكل قسم سريري' : 'Detailed placement report for each department' },
    { id: 'sites', label: locale === 'ar' ? 'سعة المواقع التدريبية' : 'Site Capacities', desc: locale === 'ar' ? 'استعراض السعة الكلية والمستخدمة لكل موقع تدريبي' : 'Site capacities, utilization, and limits' },
    { id: 'supervisors', label: locale === 'ar' ? 'أعباء المشرفين' : 'Supervisor Workloads', desc: locale === 'ar' ? 'تقرير بأعباء العمل التدريبي الموكلة لكل مشرف سريري' : 'Supervision quotas and student allocations' },
  ] as const;

  const directCsvExports = [
    { label_ar: 'تصدير بيانات الطلبة', label_en: 'Export Students', url: apiUrl('/csv-exports/students'), icon: Users, bg: 'bg-indigo-50', text: 'text-indigo-700' },
    { label_ar: 'تصدير بيانات المشرفين', label_en: 'Export Supervisors', url: apiUrl('/csv-exports/supervisors'), icon: Building2, bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { label_ar: 'تصدير سجل الحضور', label_en: 'Export Attendance', url: apiUrl('/csv-exports/attendance'), icon: Clock, bg: 'bg-amber-50', text: 'text-amber-700' },
    { label_ar: 'تصدير التقييمات السريرية', label_en: 'Export Assessments', url: apiUrl('/csv-exports/assessments'), icon: ClipboardCheck, bg: 'bg-blue-50', text: 'text-blue-700' },
    { label_ar: 'تصدير بيانات الجودة', label_en: 'Export Quality Data', url: apiUrl('/csv-exports/quality'), icon: BarChart3, bg: 'bg-purple-50', text: 'text-purple-700' },
    { label_ar: 'تصدير المراسلات', label_en: 'Export Correspondence', url: apiUrl('/csv-exports/correspondence'), icon: Mail, bg: 'bg-pink-50', text: 'text-pink-700' },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader 
        title={locale === 'ar' ? 'مركز التقارير وتصدير البيانات' : 'Reports & Data Export Center'}
        description={locale === 'ar' ? 'تصدير التقارير الإدارية الرسمية المستخرجة من التوزيعات والبيانات السريرية' : 'Export official operational reports and database records'}
      />

      {/* Quick Direct CSV Exports Hub */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <span>{locale === 'ar' ? 'تصدير البيانات المباشر (CSV Data Exports)' : 'Direct CSV Data Exports'}</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {directCsvExports.map((item, idx) => {
            const Icon = item.icon;
            return (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${item.bg} rounded-3xl p-5 border border-slate-100 flex items-center justify-between gap-3 hover:shadow-md transition-all group`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                    <Icon className={`w-5 h-5 ${item.text}`} />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${item.text}`}>{locale === 'ar' ? item.label_ar : item.label_en}</h3>
                    <p className="text-[11px] text-slate-400">CSV Spreadsheet</p>
                  </div>
                </div>
                <Download className={`w-4 h-4 ${item.text} opacity-70 group-hover:opacity-100 transition-opacity`} />
              </a>
            );
          })}
        </div>
      </div>

      {/* Operational Distribution Reports */}
      <Card className="rounded-3xl border-slate-100">
        <CardContent className="space-y-6 pt-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
              {locale === 'ar' ? 'تقارير التوزيع السريري المخصصة' : 'Custom Clinical Distribution Reports'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {reports.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setReportType(r.id)}
                  className={`p-4 cursor-pointer rounded-2xl border text-start transition-all ${
                    reportType === r.id
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <h3 className={`text-sm font-bold mb-1 ${reportType === r.id ? 'text-indigo-900' : 'text-slate-900'}`}>{r.label}</h3>
                  <p className={`text-xs ${reportType === r.id ? 'text-indigo-700' : 'text-slate-500'}`}>{r.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <Label>{locale === 'ar' ? 'رقم الدورة التدريبية' : 'Rotation ID'}</Label>
              <Input
                type="number"
                value={rotationId}
                onChange={(e) => setRotationId(parseInt(e.target.value, 10) || 1)}
                className="rounded-xl mt-1"
              />
            </div>

            {(reportType === 'departments' || reportType === 'supervisors') && (
              <div>
                <Label>
                  {reportType === 'departments' ? (locale === 'ar' ? 'رقم القسم' : 'Department ID') : (locale === 'ar' ? 'رقم المشرف' : 'Supervisor ID')}
                </Label>
                <Input
                  type="number"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder={locale === 'ar' ? 'أدخل الرقم' : 'Enter ID'}
                  className="rounded-xl mt-1"
                />
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-3">
            <Button onClick={() => handleExport('excel')} variant="primary" className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600 rounded-xl flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              {locale === 'ar' ? 'تصدير Excel (.xlsx)' : 'Export Excel (.xlsx)'}
            </Button>
            <Button onClick={() => handleExport('csv')} variant="secondary" className="rounded-xl flex items-center gap-2">
              <Download className="w-4 h-4" />
              {locale === 'ar' ? 'تصدير CSV (.csv)' : 'Export CSV (.csv)'}
            </Button>
            <Button onClick={() => handleExport('pdf')} variant="danger" className="rounded-xl flex items-center gap-2">
              <Download className="w-4 h-4" />
              {locale === 'ar' ? 'تصدير PDF (.pdf)' : 'Export PDF (.pdf)'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
export default ReportsDashboard;
