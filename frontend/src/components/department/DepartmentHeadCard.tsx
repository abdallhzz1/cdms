import { Building, Star, ExternalLink } from 'lucide-react';
import type { DepartmentHeadData } from './DeptHeadProfileModal';

interface DepartmentHeadCardProps {
  head: DepartmentHeadData;
  onOpenProfile: (head: DepartmentHeadData) => void;
}

export function DepartmentHeadCard({ head, onOpenProfile }: DepartmentHeadCardProps) {
  const totalScore = head.kpi_score || (
    head.kpis.grade_timeliness + 
    head.kpis.rotation_management + 
    head.kpis.research_output + 
    head.kpis.conferences_workshops + 
    head.kpis.student_satisfaction
  );

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs hover:shadow-lg transition-all duration-200 space-y-4 flex flex-col justify-between group">
      
      {/* Top Banner & Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 font-black text-sm border border-teal-100 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              {head.name.split(' ').map(n => n[0]).join('').slice(0, 2) || 'د.'}
            </div>

            <div>
              <h3 className="font-black text-sm text-slate-900 leading-tight group-hover:text-teal-700 transition-colors">
                {head.name}
              </h3>
              <p className="text-xs text-slate-500 font-bold mt-0.5 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-teal-600" />
                <span>قسم {head.department_name}</span>
              </p>
            </div>
          </div>

          {/* KPI Rating Score Badge */}
          <div className="text-center bg-teal-50/70 p-2 rounded-2xl border border-teal-100 shrink-0">
            <div className="flex items-center justify-center gap-0.5">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
              <span className="font-mono font-black text-sm text-teal-900">{totalScore}</span>
            </div>
            <span className="text-[10px] font-bold text-teal-700 block">/ 100</span>
          </div>
        </div>

        {/* Title & Academic Details */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-700">
            <span className="text-slate-500 font-medium">الدرجة:</span>
            <span className="font-bold text-slate-900">{head.title}</span>
          </div>

          <div className="flex items-center justify-between text-slate-700">
            <span className="text-slate-500 font-medium">العقد والتكليف:</span>
            <span className="font-bold text-teal-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 text-[11px]">
              {head.contract_type}
            </span>
          </div>
        </div>

        {/* Metrics Quick Counters */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 block">الأبحاث</span>
            <span className="font-mono font-bold text-teal-900 text-xs">{head.publications?.length || 0}</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 block">المؤتمرات</span>
            <span className="font-mono font-bold text-teal-900 text-xs">{head.conferences?.length || 0}</span>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 block">التقييم</span>
            <span className="font-bold text-emerald-700 text-[11px]">{head.kpi_rating || 'ممتاز'}</span>
          </div>
        </div>
      </div>

      {/* Footer Action Button */}
      <button
        type="button"
        onClick={() => onOpenProfile(head)}
        className="w-full py-2.5 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span>عرض بروفايل رئيس القسم والـ Score</span>
      </button>

    </div>
  );
}
