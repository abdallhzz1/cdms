import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { AdvisingNavTabs } from '@/components/advising/AdvisingNavTabs';
import { AdvisingFormPrintView } from '@/components/advising/AdvisingFormPrintView';
import { AdvisingPolicyDrawer } from '@/components/advising/AdvisingPolicyDrawer';
import { IndividualFormModal } from '@/components/advising/IndividualFormModal';
import { GroupFormModal } from '@/components/advising/GroupFormModal';
import { AtRiskFormModal } from '@/components/advising/AtRiskFormModal';
import { 
  FileText, Users, AlertTriangle, ShieldCheck, 
  Plus, Printer, Paperclip, Search, Trash2, Calendar
} from 'lucide-react';

export function AdvisingFormsPage() {
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'individual' | 'group' | 'at_risk'>('individual');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals & Drawers States
  const [isIndividualModalOpen, setIsIndividualModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isAtRiskModalOpen, setIsAtRiskModalOpen] = useState(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [printPreviewItem, setPrintPreviewItem] = useState<{ type: any; data: any } | null>(null);

  // Stored Official Forms Records State
  const [formsRecords, setFormsRecords] = useState<any[]>(() => {
    const saved = localStorage.getItem('cdms_advising_official_forms');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  });

  // Fetch payload from MySQL Database
  const { data: dbFormsPayload } = useQuery({
    queryKey: ['db-advising-official-forms'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_advising_official_forms')}`),
  });

  useEffect(() => {
    const data = Array.isArray(dbFormsPayload) ? dbFormsPayload : dbFormsPayload?.data;
    if (Array.isArray(data) && data.length > 0) {
      setFormsRecords(data);
      try { localStorage.setItem('cdms_advising_official_forms', JSON.stringify(data)); } catch (e) {}
    }
  }, [dbFormsPayload]);

  const saveFormsRecords = (updated: any[]) => {
    setFormsRecords(updated);
    try { localStorage.setItem('cdms_advising_official_forms', JSON.stringify(updated)); } catch (e) {}

    apiFetch('/operational/distribution-payload', {
      method: 'POST',
      body: { key: 'cdms_advising_official_forms', payload: updated }
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['db-advising-official-forms'] });
    }).catch(err => console.error('DB Sync Error:', err));
  };

  const handleSaveForm = (newFormPayload: any) => {
    const updated = [newFormPayload, ...formsRecords];
    saveFormsRecords(updated);
    alert(locale === 'ar' ? 'تم حفظ نموذج الإرشاد بنجاح وتوثيقه بالكلية ✓' : 'Form saved successfully ✓');
  };

  const handleDeleteForm = (formId: string) => {
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من حذف هذا السجل الإرشادي؟' : 'Delete record?')) {
      const updated = formsRecords.filter(f => f.id !== formId);
      saveFormsRecords(updated);
    }
  };

  const filteredForms = formsRecords.filter(f => {
    if (f.form_type !== activeTab) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (f.student_name && f.student_name.toLowerCase().includes(q)) ||
      (f.university_number && f.university_number.includes(q)) ||
      (f.topics_discussed && f.topics_discussed.toLowerCase().includes(q)) ||
      (f.advisor_name && f.advisor_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 pb-20">
      
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight flex items-center gap-2.5">
            <span>نماذج وسياسة الإرشاد الأكاديمي الرسمية</span>
            <span className="bg-teal-50 text-teal-800 text-xs font-mono font-bold px-2.5 py-1 rounded-xl border border-teal-200">
              AQC-8
            </span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            نماذج محاضر الاجتماعات الفردية والجماعية واستمارة المتعثرين مع ترويسة الكلية والطباعة المعتمدة
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsPolicyOpen(true)}
          className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all shrink-0 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-teal-400" />
          <span>سياسة ودليل الإرشاد (AQC-8)</span>
        </button>
      </div>

      <AdvisingNavTabs />

      {/* Action Bar: Create Forms */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Form Type Tabs */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('individual')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'individual' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-teal-600" />
            <span>المحاضر الفردية</span>
            <span className="bg-teal-50 text-teal-800 text-[10.5px] px-2 py-0.5 rounded-md font-mono">
              {formsRecords.filter(f => f.form_type === 'individual').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('group')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'group' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-teal-600" />
            <span>المحاضر الجماعية</span>
            <span className="bg-teal-50 text-teal-800 text-[10.5px] px-2 py-0.5 rounded-md font-mono">
              {formsRecords.filter(f => f.form_type === 'group').length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('at_risk')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'at_risk' ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>استمارات المتعثرين</span>
            <span className="bg-amber-50 text-amber-800 text-[10.5px] px-2 py-0.5 rounded-md font-mono">
              {formsRecords.filter(f => f.form_type === 'at_risk').length}
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'individual' && (
            <button
              type="button"
              onClick={() => setIsIndividualModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تعبئة محضر فردي جديد</span>
            </button>
          )}

          {activeTab === 'group' && (
            <button
              type="button"
              onClick={() => setIsGroupModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تعبئة محضر جماعي جديد</span>
            </button>
          )}

          {activeTab === 'at_risk' && (
            <button
              type="button"
              onClick={() => setIsAtRiskModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تعبئة استمارة متعثرين جديدة</span>
            </button>
          )}
        </div>

      </div>

      {/* Filter & Search Input */}
      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-2xs flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
        <input
          type="text"
          placeholder="بحث في سجلات المحاضر بالاسم، الرقم الجامعي، أو المواضيع..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-xs font-bold text-slate-800 bg-transparent border-none focus:outline-hidden"
        />
      </div>

      {/* Main Records List */}
      <div className="space-y-3">
        {filteredForms.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-slate-700">لا توجد محاضر إرشادية في هذا التبويب</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              قم بإنشاء نموذج إرشادي جديد بتعبئة الخانات وطباعته بترويسة الكلية الرسمية.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredForms.map((item) => (
              <div key={item.id} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-all space-y-3 flex flex-col justify-between">
                
                {/* Header Card */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-xl border border-teal-100 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-teal-600" />
                      <span>{item.date || new Date().toISOString().slice(0, 10)}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => handleDeleteForm(item.id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="حذف هذا المحضر"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Title & Student Name */}
                  {item.form_type === 'individual' && (
                    <div>
                      <h4 className="font-black text-sm text-slate-900">{item.student_name}</h4>
                      <span className="text-xs font-mono font-bold text-slate-400">{item.university_number} • {item.semester}</span>
                    </div>
                  )}

                  {item.form_type === 'group' && (
                    <div>
                      <h4 className="font-black text-sm text-slate-900">لقاء جماعي رقم ({item.meeting_number})</h4>
                      <span className="text-xs font-bold text-slate-500">
                        الحاضرون: {item.attendees_count} طلاب • الغائبون: {item.absent_count} طلاب
                      </span>
                    </div>
                  )}

                  {item.form_type === 'at_risk' && (
                    <div>
                      <h4 className="font-black text-sm text-amber-900">استمارة رصد الطلاب المتعثرين</h4>
                      <span className="text-xs font-bold text-slate-500">
                        عدد الطلبة المرصودين: {Array.isArray(item.students) ? item.students.length : 0} طالب
                      </span>
                    </div>
                  )}

                  {/* Summary Preview */}
                  {item.topics_discussed && (
                    <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2.5 rounded-xl font-serif">
                      {item.topics_discussed}
                    </p>
                  )}
                </div>

                {/* Attachments & Action Buttons */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  {item.attachments && item.attachments.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10.5px] font-bold text-slate-500 block">الملفات والمستندات المرفقة:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.attachments.map((att: any, attIdx: number) => (
                          <a
                            key={attIdx}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-xl border border-teal-200 flex items-center gap-1.5 transition-colors"
                          >
                            <Paperclip className="w-3 h-3 text-teal-600" />
                            <span className="truncate max-w-[140px]">{att.name}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10.5px] font-bold text-slate-400">المرشد: {item.advisor_name || 'د. رامي القواسمة'}</span>
                    <button
                      type="button"
                      onClick={() => setPrintPreviewItem({ type: item.form_type, data: item })}
                      className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة / PDF</span>
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals & Drawers Integration */}
      <IndividualFormModal
        isOpen={isIndividualModalOpen}
        onClose={() => setIsIndividualModalOpen(false)}
        onSave={handleSaveForm}
        onPreviewPrint={(formData) => setPrintPreviewItem({ type: 'individual', data: formData })}
      />

      <GroupFormModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        onSave={handleSaveForm}
        onPreviewPrint={(formData) => setPrintPreviewItem({ type: 'group', data: formData })}
      />

      <AtRiskFormModal
        isOpen={isAtRiskModalOpen}
        onClose={() => setIsAtRiskModalOpen(false)}
        onSave={handleSaveForm}
        onPreviewPrint={(formData) => setPrintPreviewItem({ type: 'at_risk', data: formData })}
      />

      <AdvisingPolicyDrawer
        isOpen={isPolicyOpen}
        onClose={() => setIsPolicyOpen(false)}
      />

      {printPreviewItem && (
        <AdvisingFormPrintView
          formType={printPreviewItem.type}
          data={printPreviewItem.data}
          onClose={() => setPrintPreviewItem(null)}
        />
      )}

    </div>
  );
}
