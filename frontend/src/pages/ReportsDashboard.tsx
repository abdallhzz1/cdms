import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, CheckCircle2 } from 'lucide-react';

export function ReportsDashboard() {
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const reportCategories = [
    { id: 'ALL', label: 'جميع التقارير' },
    { id: 'USERS_SECURITY', label: 'تقارير الحسابات والأمن' },
    { id: 'CLINICAL', label: 'تقارير التوزيع السريري' },
    { id: 'STAFF_SITES', label: 'تقارير الكادر والمستشفيات' },
    { id: 'AUDIT', label: 'تقارير التدقيق والتفتيش' },
  ];

  const reportsList = [
    {
      id: 'rep_1',
      title: 'تقرير كشف الحسابات والأدوار التقنية الموزعة',
      category: 'USERS_SECURITY',
      description: 'كشف شامل بحسابات المستخدمين، البريد الجامعي، والأدوار المسندة في النظام.',
      format: 'Excel / PDF',
      count: '12 حساب',
    },
    {
      id: 'rep_2',
      title: 'تقرير سجل الحركات والتدقيق الأمني (Audit Log Export)',
      category: 'AUDIT',
      description: 'تصدير كامل لكافة العمليات الحساسة والتغييرات التي تمت على قواعد البيانات.',
      format: 'Excel / CSV',
      count: '48 سجل',
    },
    {
      id: 'rep_3',
      title: 'تقرير التوزيع السريري العام للمستشفيات',
      category: 'CLINICAL',
      description: 'توزيع الطلبة على مستشفيات الخليل والأقسام الطبية والدوائر السريرية.',
      format: 'Excel / PDF',
      count: '180 طالب',
    },
    {
      id: 'rep_4',
      title: 'تقرير نصاب وساعات المشرفين السريريين',
      category: 'STAFF_SITES',
      description: 'حساب ساعات الإشراف والعبء الأكاديمي والسريري لكل مشرف.',
      format: 'PDF / Printable',
      count: '16 مشرف',
    },
    {
      id: 'rep_5',
      title: 'تقرير السعة الاستيعابية لمواقع التدريب السريري',
      category: 'STAFF_SITES',
      description: 'القدرة الاستيعابية لكل مستشفى ومجمع طبي حسب التخصص.',
      format: 'Excel',
      count: '8 مستشفيات',
    },
  ];

  const filteredReports = activeCategory === 'ALL'
    ? reportsList
    : reportsList.filter((r) => r.category === activeCategory);

  const handleExport = (title: string) => {
    setSuccessMessage(`جاري تصدير وتنزيل "${title}" بنجاح...`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز التقارير والإحصائيات الشاملة (Reports Hub)"
        description="استخراج وتصدير تقارير الحسابات، التوزيع السريري، الكادر الطبي، وسجلات التدقيق."
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

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                size="sm"
                onClick={() => handleExport(rep.title)}
                className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                تصدير التقرير
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
