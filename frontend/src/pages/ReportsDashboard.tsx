import React, { useState } from 'react';
import { getReportDownloadUrl } from '../api/distribution';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Form';
import { useI18n } from '@/i18n/I18nContext';

export const ReportsDashboard: React.FC = () => {
  const { t } = useI18n();
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
    { id: 'students', label: t('reports.master_students', 'الطلبة والتوزيعات'), desc: 'تقرير شامل بجميع الطلبة وتعييناتهم السريرية' },
    { id: 'unassigned', label: t('reports.unassigned', 'الطلبة غير الموزعين'), desc: 'تقرير بالطلبة الذين لم يتم تسكينهم في أي موقع تدريبي' },
    { id: 'departments', label: t('reports.departments', 'توزيع الأقسام'), desc: 'تقرير مفصل بالتوزيع الخاص بكل قسم سريري' },
    { id: 'sites', label: t('reports.sites', 'سعة المواقع التدريبية'), desc: 'استعراض السعة الكلية والمستخدمة لكل موقع تدريبي' },
    { id: 'supervisors', label: t('reports.supervisors', 'أعباء المشرفين'), desc: 'تقرير بأعباء العمل التدريبي الموكلة لكل مشرف سريري' },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader 
        title={t('nav.reports', 'التقارير التشغيلية')}
        description={t('reports.description', 'تصدير التقارير الإدارية الرسمية المستخرجة من التوزيعات السريرية المعتمدة')}
      />

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div>
            <Label className="mb-3">{t('reports.select_type', 'اختر نوع التقرير')}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {reports.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setReportType(r.id)}
                  className={`p-4 cursor-pointer rounded-lg border text-start transition-all ${
                    reportType === r.id
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <h3 className={`text-sm font-semibold mb-1 ${reportType === r.id ? 'text-indigo-900' : 'text-slate-900'}`}>{r.label}</h3>
                  <p className={`text-xs ${reportType === r.id ? 'text-indigo-700' : 'text-slate-500'}`}>{r.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <Label>{t('schedule.rotation', 'الدورة التدريبية')}</Label>
              <Input
                type="number"
                value={rotationId}
                onChange={(e) => setRotationId(parseInt(e.target.value, 10) || 1)}
              />
            </div>

            {(reportType === 'departments' || reportType === 'supervisors') && (
              <div>
                <Label>
                  {reportType === 'departments' ? t('reports.department_id', 'رقم القسم') : t('reports.supervisor_id', 'رقم المشرف')}
                </Label>
                <Input
                  type="number"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder={t('reports.enter_id', 'أدخل الرقم')}
                />
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-3">
            <Button onClick={() => handleExport('excel')} variant="primary" className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600">
              {t('reports.export_excel', 'تصدير Excel (.xlsx)')}
            </Button>
            <Button onClick={() => handleExport('csv')} variant="secondary">
              {t('reports.export_csv', 'تصدير CSV (.csv)')}
            </Button>
            <Button onClick={() => handleExport('pdf')} variant="danger">
              {t('reports.export_pdf', 'تصدير PDF (.pdf)')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
export default ReportsDashboard;
