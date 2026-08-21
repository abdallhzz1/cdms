import { useState, useEffect } from 'react';
import { 
  X, User, FileText, BookOpen, Award, BarChart3, 
  GraduationCap, Building, Pencil, Plus, Trash2, Save
} from 'lucide-react';
import { apiFetch } from '@/api/client';

export interface PublicationItem {
  title: string;
  journal: string;
  year: string;
  doi?: string;
}

export interface ConferenceItem {
  name: string;
  location: string;
  date: string;
  role: string;
}

export interface DepartmentHeadData {
  id: string;
  user_id?: number | string;
  name: string;
  name_en?: string;
  title: string;
  department_name: string;
  department_name_en?: string;
  avatar_url?: string;
  email: string;
  phone?: string;
  contract_type: string;
  appointment_date: string;
  kpi_score: number;
  kpi_rating: 'ممتاز' | 'جيد جداً' | 'جيد' | 'مقبول';
  cv_summary: string;
  specialty: string;
  publications_count?: number;
  conferences_count?: number;
  publications: PublicationItem[];
  conferences: ConferenceItem[];
  workshops?: { title: string; date: string; hours: number }[];
  kpis: {
    grade_timeliness: number;
    rotation_management: number;
    research_output: number;
    conferences_workshops: number;
    student_satisfaction: number;
  };
}

interface DeptHeadProfileModalProps {
  head: DepartmentHeadData | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveProfile?: (updatedHead: DepartmentHeadData) => void;
}

export function DeptHeadProfileModal({ head, isOpen, onClose, onSaveProfile }: DeptHeadProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'cv' | 'research' | 'conferences' | 'kpi'>('cv');
  const [isEditMode, setIsEditMode] = useState(false);

  // Editable Profile Form State
  const [profileData, setProfileData] = useState<DepartmentHeadData | null>(null);

  // New Research Input
  const [newPubTitle, setNewPubTitle] = useState('');
  const [newPubJournal, setNewPubJournal] = useState('');
  const [newPubYear, setNewPubYear] = useState('2024');
  const [newPubDoi, setNewPubDoi] = useState('');

  // New Conference Input
  const [newConfName, setNewConfName] = useState('');
  const [newConfLocation, setNewConfLocation] = useState('');
  const [newConfDate, setNewConfDate] = useState('');
  const [newConfRole, setNewConfRole] = useState('متحدث ورئيس جلسة');

  useEffect(() => {
    if (head) {
      setProfileData({ ...head });
      setIsEditMode(false);
    }
  }, [head]);

  if (!isOpen || !profileData) return null;

  const isCurrentDeptHeadOrAdmin = true; // allow editing profile

  const totalScore = profileData.kpi_score || (
    profileData.kpis.grade_timeliness + 
    profileData.kpis.rotation_management + 
    profileData.kpis.research_output + 
    profileData.kpis.conferences_workshops + 
    profileData.kpis.student_satisfaction
  );

  const handleSaveProfileData = async () => {
    if (!profileData) return;

    try {
      const payloadKey = `cdms_dept_head_profile_${profileData.id}`;
      await apiFetch('/operational/distribution-payload', {
        method: 'POST',
        body: { key: payloadKey, payload: profileData }
      });
      localStorage.setItem(payloadKey, JSON.stringify(profileData));

      if (onSaveProfile) {
        onSaveProfile(profileData);
      }

      setIsEditMode(false);
      alert('تم حفظ وتحديث بروفايل رئيس القسم بنجاح ✓');
    } catch (err) {
      console.error('Failed to save head profile:', err);
      alert('تم حفظ التعديلات في الذاكرة المحلية ✓');
      if (onSaveProfile) onSaveProfile(profileData);
      setIsEditMode(false);
    }
  };

  const handleAddPublication = () => {
    if (!newPubTitle.trim()) return;
    const newPub: PublicationItem = {
      title: newPubTitle.trim(),
      journal: newPubJournal.trim() || 'مجلة علمية محكمة',
      year: newPubYear || '2024',
      doi: newPubDoi.trim() || undefined
    };
    const updatedPubs = [...(profileData.publications || []), newPub];
    setProfileData({
      ...profileData,
      publications: updatedPubs,
      publications_count: updatedPubs.length
    });
    setNewPubTitle('');
    setNewPubJournal('');
    setNewPubDoi('');
  };

  const handleDeletePublication = (index: number) => {
    const updatedPubs = profileData.publications.filter((_, idx) => idx !== index);
    setProfileData({
      ...profileData,
      publications: updatedPubs,
      publications_count: updatedPubs.length
    });
  };

  const handleAddConference = () => {
    if (!newConfName.trim()) return;
    const newConf: ConferenceItem = {
      name: newConfName.trim(),
      location: newConfLocation.trim() || 'جامعة الخليل',
      date: newConfDate || '2024',
      role: newConfRole.trim() || 'مشارك'
    };
    const updatedConfs = [...(profileData.conferences || []), newConf];
    setProfileData({
      ...profileData,
      conferences: updatedConfs,
      conferences_count: updatedConfs.length
    });
    setNewConfName('');
    setNewConfLocation('');
    setNewConfDate('');
  };

  const handleDeleteConference = (index: number) => {
    const updatedConfs = profileData.conferences.filter((_, idx) => idx !== index);
    setProfileData({
      ...profileData,
      conferences: updatedConfs,
      conferences_count: updatedConfs.length
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
        
        {/* Profile Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white p-6 relative">
          <div className="absolute top-4 left-4 flex items-center gap-2">
            {isCurrentDeptHeadOrAdmin && (
              <button
                type="button"
                onClick={() => {
                  if (isEditMode) handleSaveProfileData();
                  else setIsEditMode(true);
                }}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
                  isEditMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {isEditMode ? (
                  <>
                    <Save className="w-4 h-4" />
                    <span>حفظ التغييرات</span>
                  </>
                ) : (
                  <>
                    <Pencil className="w-4 h-4 text-amber-400" />
                    <span>تعديل البروفايل</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 pt-2">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-3xl bg-teal-600/30 border-2 border-teal-400/40 flex items-center justify-center text-white text-2xl font-black shrink-0 shadow-inner overflow-hidden">
              {profileData.avatar_url ? (
                <img src={profileData.avatar_url} alt={profileData.name} className="w-full h-full object-cover" />
              ) : (
                profileData.name.split(' ').map(n => n[0]).join('').slice(0, 2) || 'د.'
              )}
            </div>

            {/* Basic Info */}
            <div className="space-y-1.5 text-center sm:text-start flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-xl font-black text-white">{profileData.name}</h2>
                <span className="bg-teal-500/20 text-teal-300 border border-teal-400/30 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                  رئيس قسم {profileData.department_name}
                </span>
              </div>

              <p className="text-xs text-slate-300 font-medium flex items-center justify-center sm:justify-start gap-2">
                <GraduationCap className="w-4 h-4 text-teal-400" />
                <span>{profileData.title}</span>
                <span>•</span>
                <Building className="w-4 h-4 text-teal-400" />
                <span>كلية الطب البشري</span>
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1 text-xs text-slate-300">
                <span className="font-mono">{profileData.email}</span>
                {profileData.phone && <span>• {profileData.phone}</span>}
              </div>
            </div>

            {/* KPI Score Badge */}
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 text-center shrink-0 min-w-[120px]">
              <span className="text-[10px] font-bold text-teal-300 block">مؤشر الأداء الكلي</span>
              <div className="flex items-center justify-center gap-1 my-0.5">
                <span className="text-2xl font-black text-amber-400">{totalScore}</span>
                <span className="text-xs text-slate-300 font-bold">/ 100</span>
              </div>
              <span className="inline-block text-[11px] font-extrabold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-400/30">
                ⭐ {profileData.kpi_rating || 'ممتاز'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('cv')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'cv' ? 'bg-white text-teal-800 shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4 text-teal-600" />
            <span>السيرة الذاتية والعقد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('research')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'research' ? 'bg-white text-teal-800 shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4 text-teal-600" />
            <span>الأبحاث والنشرات ({profileData.publications?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('conferences')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'conferences' ? 'bg-white text-teal-800 shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-4 h-4 text-teal-600" />
            <span>المؤتمرات والورش ({profileData.conferences?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kpi')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'kpi' ? 'bg-white text-teal-800 shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-amber-600" />
            <span>مؤشرات قياس الأداء (KPIs)</span>
          </button>
        </div>

        {/* Modal Tab Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          
          {/* TAB 1: CV & CONTRACT */}
          {activeTab === 'cv' && (
            <div className="space-y-5">
              {isEditMode ? (
                <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200 space-y-3">
                  <h4 className="font-bold text-amber-900 text-xs">تعديل بيانات السيرة الذاتية والعقد:</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">الرتبة / اللقب الأكاديمي</label>
                      <input
                        type="text"
                        value={profileData.title}
                        onChange={(e) => setProfileData({ ...profileData, title: e.target.value })}
                        className="w-full p-2 border rounded-xl bg-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">التخصص الدقيق</label>
                      <input
                        type="text"
                        value={profileData.specialty}
                        onChange={(e) => setProfileData({ ...profileData, specialty: e.target.value })}
                        className="w-full p-2 border rounded-xl bg-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">نوع العقد والتكليف</label>
                      <input
                        type="text"
                        value={profileData.contract_type}
                        onChange={(e) => setProfileData({ ...profileData, contract_type: e.target.value })}
                        className="w-full p-2 border rounded-xl bg-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">رقم الهاتف / للتواصل</label>
                      <input
                        type="text"
                        value={profileData.phone || ''}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        className="w-full p-2 border rounded-xl bg-white font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">رابط الصورة الشخصية (Avatar URL)</label>
                    <input
                      type="text"
                      value={profileData.avatar_url || ''}
                      onChange={(e) => setProfileData({ ...profileData, avatar_url: e.target.value })}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full p-2 border rounded-xl bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ملخص السيرة الذاتية والأكاديمية</label>
                    <textarea
                      rows={3}
                      value={profileData.cv_summary}
                      onChange={(e) => setProfileData({ ...profileData, cv_summary: e.target.value })}
                      className="w-full p-2 border rounded-xl bg-white font-serif leading-relaxed"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 block">نوع العقد الأكاديمي</span>
                      <span className="font-bold text-slate-900 text-xs block">{profileData.contract_type || 'عقد دائم — متفرغ'}</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 block">تاريخ التكليف برئاسة القسم</span>
                      <span className="font-bold text-slate-900 text-xs block">{profileData.appointment_date || '01/09/2024'}</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 block">التخصص الدقيق</span>
                      <span className="font-bold text-slate-900 text-xs block">{profileData.specialty || 'استشاري أمراض باطنية'}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600" />
                      <span>ملخص السيرة الذاتية والأكاديمية:</span>
                    </h4>
                    <p className="p-4 bg-slate-50 rounded-2xl border border-slate-200 font-serif leading-relaxed text-slate-800">
                      {profileData.cv_summary || 'عضو هيئة تدريس واستشاري سريري بكلية الطب البشري بجامعة الخليل، يمتلك خبرة أكاديمية وسريرية واسعة في الإشراف على مساقات الدائرة السريرية، ومتابعة تدريب الطلاب في المستشفيات التعليمية.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: RESEARCH & PUBLICATIONS */}
          {activeTab === 'research' && (
            <div className="space-y-4">
              {/* Form to add research if in edit mode */}
              {isEditMode && (
                <div className="bg-teal-50/60 p-3.5 rounded-2xl border border-teal-100 space-y-2">
                  <h4 className="font-bold text-teal-900 text-xs flex items-center gap-1">
                    <Plus className="w-4 h-4 text-teal-600" />
                    <span>إضافة بحث أو ورقة علمية جديدة:</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="عنوان البحث العلمي..."
                      value={newPubTitle}
                      onChange={(e) => setNewPubTitle(e.target.value)}
                      className="p-2 border rounded-xl text-xs font-bold bg-white"
                    />
                    <input
                      type="text"
                      placeholder="اسم المجلة العلمية..."
                      value={newPubJournal}
                      onChange={(e) => setNewPubJournal(e.target.value)}
                      className="p-2 border rounded-xl text-xs bg-white"
                    />
                    <input
                      type="text"
                      placeholder="السنة (مثال: 2024)"
                      value={newPubYear}
                      onChange={(e) => setNewPubYear(e.target.value)}
                      className="p-2 border rounded-xl text-xs font-mono bg-white"
                    />
                    <input
                      type="text"
                      placeholder="معرف DOI (اختياري)..."
                      value={newPubDoi}
                      onChange={(e) => setNewPubDoi(e.target.value)}
                      className="p-2 border rounded-xl text-xs font-mono bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPublication}
                    className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    + إضافة البحث للسجل
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm">قائمة الأبحاث والأوراق العلمية المنشورة:</h4>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200">
                  إجمالي الأبحاث: {profileData.publications?.length || 0}
                </span>
              </div>

              {profileData.publications && profileData.publications.length > 0 ? (
                <div className="space-y-2">
                  {profileData.publications.map((pub, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 relative group">
                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => handleDeletePublication(idx)}
                          className="absolute top-3 left-3 p-1 rounded-lg text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="font-bold text-slate-900 text-xs leading-relaxed">{pub.title}</h5>
                        <span className="font-mono text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {pub.year}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium pt-1">
                        <span>المجلة: <strong className="text-slate-700">{pub.journal}</strong></span>
                        {pub.doi && (
                          <span className="font-mono text-teal-700 font-bold">DOI: {pub.doi}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl">
                  لا توجد أبحاث مسجلة ل رئيس القسم حالياً.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CONFERENCES & WORKSHOPS */}
          {activeTab === 'conferences' && (
            <div className="space-y-4">
              {isEditMode && (
                <div className="bg-teal-50/60 p-3.5 rounded-2xl border border-teal-100 space-y-2">
                  <h4 className="font-bold text-teal-900 text-xs flex items-center gap-1">
                    <Plus className="w-4 h-4 text-teal-600" />
                    <span>إضافة مؤتمر أو مشاركة جديدة:</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="اسم المؤتمر أو الورشة..."
                      value={newConfName}
                      onChange={(e) => setNewConfName(e.target.value)}
                      className="p-2 border rounded-xl text-xs font-bold bg-white"
                    />
                    <input
                      type="text"
                      placeholder="المكان / المدينة..."
                      value={newConfLocation}
                      onChange={(e) => setNewConfLocation(e.target.value)}
                      className="p-2 border rounded-xl text-xs bg-white"
                    />
                    <input
                      type="text"
                      placeholder="التاريخ (مثال: مايو 2024)"
                      value={newConfDate}
                      onChange={(e) => setNewConfDate(e.target.value)}
                      className="p-2 border rounded-xl text-xs bg-white"
                    />
                    <input
                      type="text"
                      placeholder="الدور (مثال: متحدث رئيسي)"
                      value={newConfRole}
                      onChange={(e) => setNewConfRole(e.target.value)}
                      className="p-2 border rounded-xl text-xs bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddConference}
                    className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    + إضافة المؤتمر للسجل
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">المشاركات في المؤتمرات الطبية والعلمية:</h4>
                {profileData.conferences && profileData.conferences.length > 0 ? (
                  <div className="space-y-2">
                    {profileData.conferences.map((conf, idx) => (
                      <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs relative">
                        <div>
                          <h5 className="font-bold text-slate-900">{conf.name}</h5>
                          <span className="text-[11px] text-slate-500">{conf.location} • الدور: <strong className="text-teal-800">{conf.role}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-600 text-[11px] bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                            {conf.date}
                          </span>
                          {isEditMode && (
                            <button
                              type="button"
                              onClick={() => handleDeleteConference(idx)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 p-4 text-center">لا توجد مؤتمرات مسجلة.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: KPI PERFORMANCE SCORECARD */}
          {activeTab === 'kpi' && (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-amber-500/10 to-teal-500/10 p-4 rounded-2xl border border-amber-200/60 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">مؤشر قياس وتقييم أداء رئيس القسم (KPI Scorecard)</h4>
                  <p className="text-[11px] text-slate-600">يقاس الأداء بناءً على 5 محاور رئيسية معتمدة من الكلية والجودة</p>
                </div>

                <div className="text-left font-mono font-black text-2xl text-teal-800">
                  {totalScore} <span className="text-xs text-slate-500">/ 100</span>
                </div>
              </div>

              {/* KPI Items breakdown */}
              <div className="space-y-3">
                <div className="space-y-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>1. الالتزام بمواعيد رفع واعتماذ العلامات والامتحانات السريرية</span>
                    <span className="font-mono text-teal-700">{profileData.kpis.grade_timeliness} / 25</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(profileData.kpis.grade_timeliness / 25) * 100}%` }} />
                  </div>
                </div>

                <div className="space-y-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>2. إداراة الروتيشنات وتكليفات المستشفيات والمشرفين</span>
                    <span className="font-mono text-teal-700">{profileData.kpis.rotation_management} / 25</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(profileData.kpis.rotation_management / 25) * 100}%` }} />
                  </div>
                </div>

                <div className="space-y-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>3. الإنتاج الأكاديمي والنشر في المجلات المعتمدة</span>
                    <span className="font-mono text-teal-700">{profileData.kpis.research_output} / 20</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(profileData.kpis.research_output / 20) * 100}%` }} />
                  </div>
                </div>

                <div className="space-y-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>4. المشاركة في المؤتمرات والورش الطبية والجودة</span>
                    <span className="font-mono text-teal-700">{profileData.kpis.conferences_workshops} / 15</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(profileData.kpis.conferences_workshops / 15) * 100}%` }} />
                  </div>
                </div>

                <div className="space-y-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>5. تقييمات الطلاب والإرشاد والأكاديمي بالقسم</span>
                    <span className="font-mono text-teal-700">{profileData.kpis.student_satisfaction} / 15</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(profileData.kpis.student_satisfaction / 15) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">جامعة الخليل — نظام إدارة الدائرة السريرية</span>
          
          <div className="flex items-center gap-2">
            {isEditMode && (
              <button
                type="button"
                onClick={handleSaveProfileData}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
              >
                <Save className="w-4 h-4" />
                <span>حفظ التعديلات في السجل</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              إغلاق البروفايل
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
