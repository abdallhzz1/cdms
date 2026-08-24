import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FileSpreadsheet, Activity, Users, GraduationCap, ClipboardCheck, Stethoscope } from 'lucide-react';

export function ReportsDashboard() {
  const {} = useAuth();
  const [activeCategory, setActiveCategory] = useState('ALL');

  const reportCategories = [
    { id: 'ALL', label: 'جميع التقارير' },
    { id: 'ACADEMIC', label: 'التقارير الأكاديمية' },
    { id: 'CLINICAL', label: 'التقارير السريرية' },
    { id: 'QUALITY', label: 'تقارير الجودة' },
  ];

  const handleDownload = (endpoint: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    fetch(`/api/v1/export/${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => response.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${endpoint}-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    })
    .catch(err => console.error("Download failed", err));
  };

  const reports = [
    {
      id: 'students',
      title: 'تقرير بيانات الطلبة (Student Registry)',
      category: 'ACADEMIC',
      description: 'كشف ببيانات الطلبة، والمعدلات التراكمية، وحالة التسجيل.',
      icon: Users,
      endpoint: 'students',
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      id: 'grades',
      title: 'تقرير العلامات (Grade Entries)',
      category: 'ACADEMIC',
      description: 'علامات الطلبة في المساقات السريرية، والأوسكي، والامتحان الكتابي.',
      icon: GraduationCap,
      endpoint: 'grades',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      id: 'attendance',
      title: 'تقرير الحضور والغياب (Attendance Records)',
      category: 'CLINICAL',
      description: 'سجلات حضور الطلبة للفعاليات السريرية والمحاضرات.',
      icon: Activity,
      endpoint: 'attendance',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      id: 'assessments',
      title: 'تقرير التقييمات السريرية (Clinical Assessments)',
      category: 'CLINICAL',
      description: 'تقييمات المشرفين السريريين للطلبة أثناء الجولات (Mini-CEX, DOPS).',
      icon: Stethoscope,
      endpoint: 'assessments',
      color: 'text-rose-600',
      bg: 'bg-rose-50',
    },
    {
      id: 'staff',
      title: 'تقرير الكادر الأكاديمي (Staff Directory)',
      category: 'ACADEMIC',
      description: 'بيانات أعضاء هيئة التدريس والمشرفين السريريين والأقسام.',
      icon: Users,
      endpoint: 'staff',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      id: 'quality',
      title: 'تقرير خطط التحسين (Quality Plans)',
      category: 'QUALITY',
      description: 'خطط تحسين الجودة الأكاديمية والسريرية وأولوياتها.',
      icon: ClipboardCheck,
      endpoint: 'quality',
      color: 'text-teal-600',
      bg: 'bg-teal-50',
    }
  ];

  const filteredReports = activeCategory === 'ALL' ? reports : reports.filter(r => r.category === activeCategory);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader
        title="مركز التقارير (Reports Center)"
        description="تصدير وتحميل التقارير الأكاديمية والسريرية وتقارير الجودة بصيغة جداول بيانات (CSV/Excel)."
      />

      <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {reportCategories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
              activeCategory === cat.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReports.map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.id} className="p-5 flex flex-col gap-4 border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-2xl ${report.bg} ${report.color} flex items-center justify-center shrink-0`}>
                   <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1">{report.title}</h3>
                  <p className="text-xs text-slate-500 leading-snug">{report.description}</p>
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-slate-50 flex justify-end">
                 <Button 
                   onClick={() => handleDownload(report.endpoint)}
                   className="w-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-700 font-bold text-xs gap-2"
                 >
                   <FileSpreadsheet className="w-4 h-4" /> تصدير CSV / Excel
                 </Button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  );
}


