import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, Printer, CheckCircle2 } from 'lucide-react';

export function ReportsDashboard() {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const reportCategories = [
    { id: 'ALL', label: 'جميع التقارير المتاحة' },
    { id: 'USERS_SECURITY', label: 'تقارير الحسابات والأمن' },
    { id: 'CLINICAL', label: 'تقارير التوزيع السريري' },
    { id: 'STAFF_SITES', label: 'تقارير الكادر والمستشفيات' },
    { id: 'AUDIT', label: 'تقارير التدقيق والتفتيش' },
  ];

  const reportsList = [
    {
      id: 'rep_users',
      title: 'تقرير كشف الحسابات والأدوار التقنية الموزعة',
      category: 'USERS_SECURITY',
      description: 'كشف شامل بحسابات المستخدمين، البريد الجامعي، والأدوار المسندة في النظام.',
      format: 'Excel / CSV / PDF',
      count: '12 حساب',
      data: [
        ['المعرف', 'اسم المستخدم', 'البريد الجامعي', 'الدور التقني', 'الحالة'],
        ['1', 'مدير النظام (Computer Center)', 'admin1@hebron.edu', 'مدير النظام الفني (SYS_ADMIN)', 'نشط'],
        ['2', 'د. معتز التميمي', 'mutaz@hebron.edu', 'مدير الدائرة السريرية (CLINICAL_DIRECTOR)', 'نشط'],
        ['3', 'د. أسماء رئيس القسم', 'asmaa@hebron.edu', 'رئيس القسم الأكاديمي (DEPARTMENT_HEAD)', 'نشط'],
        ['4', 'أ. خالد المشرف السريري', 'khaled@hebron.edu', 'المشرف السريري (CLINICAL_SUPERVISOR)', 'نشط'],
        ['5', 'مساعد الإرشاد الأكاديمي', 'advisor@hebron.edu', 'المرشد الأكاديمي (ACADEMIC_ADVISOR)', 'نشط'],
      ],
    },
    {
      id: 'rep_audit',
      title: 'تقرير سجل الحركات والتدقيق الأمني (Audit Log Export)',
      category: 'AUDIT',
      description: 'تصدير كامل لكافة العمليات الحساسة والتغييرات التي تمت على قواعد البيانات.',
      format: 'Excel / CSV / PDF',
      count: '48 سجل',
      data: [
        ['المعرف', 'المستخدم', 'الإجراء / العملية', 'التفاصيل', 'التاريخ والوقت'],
        ['101', 'admin1@hebron.edu', 'تحديث إعدادات النظام', 'تم تحديث التخزين السريع ومهلة الجلسات', '2026-08-22 01:20'],
        ['102', 'admin1@hebron.edu', 'طرد جلسة', 'تم إنهاء الجلسة رقم sess_12 بنجاح', '2026-08-22 01:15'],
        ['103', 'mutaz@hebron.edu', 'تسجيل دخول', 'تسجيل دخول ناجح للمنظومة', '2026-08-22 00:48'],
        ['104', 'admin1@hebron.edu', 'تحديث الصلاحيات', 'تحديث مصفوفة صلاحيات الأدوار', '2026-08-22 00:30'],
      ],
    },
    {
      id: 'rep_clinical',
      title: 'تقرير التوزيع السريري العام للمستشفيات والطلبة',
      category: 'CLINICAL',
      description: 'توزيع الطلبة على مستشفيات الخليل والأقسام الطبية والدوائر السريرية.',
      format: 'Excel / CSV / PDF',
      count: '180 طالب',
      data: [
        ['الرقم الجامعي', 'اسم الطالب', 'السنة الدراسية', 'المستشفى / الموقع', 'القسم السريري'],
        ['20211001', 'أحمد محمود القواسمي', 'السنة الخامسة', 'مستشفى الخليل الحكومي', 'الباثولوجي والجراحة'],
        ['20211002', 'سارة يوسف النتشة', 'السنة الخامسة', 'مستشفى الميزان التخصصي', 'الأطفال والولادة'],
        ['20211003', 'عمر عبد اللطيف الشريف', 'السنة السادس', 'مستشفى الأنشطة الطبية', 'الباطني والطوارئ'],
        ['20211004', 'مريم خالد شاهين', 'السنة الخامسة', 'مستشفى الخليل الحكومي', 'النسائية والتوليد'],
      ],
    },
    {
      id: 'rep_workload',
      title: 'تقرير نصاب وساعات المشرفين السريريين',
      category: 'STAFF_SITES',
      description: 'حساب ساعات الإشراف والعبء الأكاديمي والسريري لكل مشرف.',
      format: 'Excel / CSV / PDF',
      count: '16 مشرف',
      data: [
        ['اسم المشرف السريري', 'المستشفى المكلف', 'عدد أسابيع الإشراف', 'عدد الطلبة', 'التقييم العام'],
        ['د. طارق السعيد', 'مستشفى الخليل الحكومي', '16 أسبوع', '12 طالب', 'ممتاز (95%)'],
        ['د. رانية الكرد', 'مستشفى الميزان', '14 أسبوع', '10 طالب', 'ممتاز (92%)'],
        ['د. سامر عابدين', 'مستشفى الأهلي', '16 أسبوع', '15 طالب', 'جيد جداً (88%)'],
      ],
    },
    {
      id: 'rep_capacity',
      title: 'تقرير السعة الاستيعابية لمواقع التدريب والمستشفيات',
      category: 'STAFF_SITES',
      description: 'القدرة الاستيعابية لكل مستشفى ومجمع طبي حسب التخصص.',
      format: 'Excel / CSV / PDF',
      count: '8 مستشفيات',
      data: [
        ['اسم المستشفى / المركز', 'المدينة / الموقع', 'الأقسام المتاحة', 'السعة القصوى للطلبة', 'نسبة الإشغال'],
        ['مستشفى الخليل الحكومي', 'الخليل - عين سارة', 'جراحة، باطني، أطفال', '60 طالب', '85%'],
        ['مستشفى الميزان التخصصي', 'الخليل - الحرس', 'نسائية، أطفال، طوارئ', '40 طالب', '75%'],
        ['مستشفى المستشفى الأهلي', 'الخليل - نمرة', 'جراحة أعصاب، باطني', '50 طالب', '80%'],
      ],
    },
  ];

  const filteredReports = activeCategory === 'ALL'
    ? reportsList
    : reportsList.filter((r) => r.category === activeCategory);

  // Real UTF-8 BOM CSV File Download
  const handleDownloadCSV = (rep: typeof reportsList[0]) => {
    const csvRows = rep.data.map((row) => row.map((val) => `"${val.replace(/"/g, '""')}"`).join(','));

    const csvContent =
      '\uFEFF' +
      '# ==========================================================================\n' +
      '# جامعة الخليل - HEBRON UNIVERSITY\n' +
      '# كلية الطب والعلوم الصحية - الدائرة السريرية (CDMS)\n' +
      `# التقرير: ${rep.title}\n` +
      `# تاريخ التصدير: ${new Date().toLocaleString('ar-EG')} | المصدّر: ${user?.name || 'مدير النظام'}\n` +
      '# ==========================================================================\n\n' +
      csvRows.join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${rep.id}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSuccessMessage(`تم تنزيل ملف "${rep.title}" (Excel / CSV) برويسة جامعة الخليل بنجاح.`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Real Official Printable PDF Report Window
  const handlePrintPDF = (rep: typeof reportsList[0]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const headers = rep.data[0];
    const rows = rep.data.slice(1);

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${rep.title} - جامعة الخليل</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 35px; color: #0f172a; line-height: 1.6; }
          .header { text-align: center; border-bottom: 3px double #0d9488; padding-bottom: 20px; margin-bottom: 25px; }
          .header h1 { margin: 0; color: #0f766e; font-size: 24px; font-weight: 800; }
          .header h2 { margin: 5px 0 0; color: #334155; font-size: 16px; font-weight: 600; }
          .header h3 { margin: 12px 0 0; color: #0d9488; font-size: 18px; font-weight: bold; }
          .meta-info { display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-bottom: 20px; background: #f8fafc; padding: 12px 18px; border-radius: 10px; border: 1px solid #e2e8f0; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th { background: #0f766e; color: white; padding: 12px 10px; text-align: right; border: 1px solid #0d9488; font-weight: bold; }
          td { padding: 10px; border: 1px solid #cbd5e1; }
          tr:nth-child(even) { background: #f8fafc; }
          .footer { margin-top: 50px; text-align: left; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
          .signature-box { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>جامعة الخليل - HEBRON UNIVERSITY</h1>
          <h2>كلية الطب والعلوم الصحية - الدائرة السريرية (CDMS)</h2>
          <h3>${rep.title}</h3>
        </div>

        <div class="meta-info">
          <span>تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}</span>
          <span>المصدّر: ${user?.name || 'مدير النظام الفني'} (${user?.email || 'admin1@hebron.edu'})</span>
          <span>إجمالي السجلات: ${rep.count}</span>
        </div>

        <table>
          <thead>
            <tr>
              ${headers.map((h) => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                ${row.map((cell) => `<td>${cell}</td>`).join('')}
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="signature-box">
          <div>توقيع مسؤول الدائرة السريرية: ........................</div>
          <div>ختم واعتماد مدير النظام الفني: ........................</div>
        </div>

        <div class="footer">
          وثيقة رسمية صادرة عن نظام إدارة الدائرة السريرية (CDMS) - جامعة الخليل © ${new Date().getFullYear()}
        </div>

        <script>window.print();</script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز التقارير والإحصائيات الشاملة (Reports Hub)"
        description="استخراج وتنزيل تقارير الحسابات، التوزيع السريري، والكادر الطبي برويسة جامعة الخليل الرسمية."
      />

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Report Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {reportCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredReports.map((rep) => (
          <Card key={rep.id} className="p-6 border-slate-100 shadow-xs hover:border-slate-200 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-bold border border-teal-100">
                  {rep.format}
                </span>
                <span className="text-xs text-slate-400 font-mono">{rep.count}</span>
              </div>

              <h3 className="font-bold text-slate-900 text-sm">{rep.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{rep.description}</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                size="sm"
                onClick={() => handleDownloadCSV(rep)}
                className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                تنزيل ملف (Excel / CSV)
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePrintPDF(rep)}
                className="gap-2 rounded-xl border-slate-300 font-bold text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة التقرير برويسة الجامعة
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
