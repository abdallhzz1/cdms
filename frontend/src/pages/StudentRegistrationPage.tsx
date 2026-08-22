import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { 
  CheckCircle2, ArrowRightLeft, Clock, ShieldCheck, 
  Building2, GraduationCap, Check, Lock
} from 'lucide-react';

export function StudentRegistrationPage() {
  const { user } = useAuth();

  // Active student registration state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>('sg_a1');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Swap Request Modal
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [targetStudentId, setTargetStudentId] = useState('');
  const [swapNotes, setSwapNotes] = useState('');

  // Sample Groups for the student's cohort (5th Year)
  const [availableGroups] = useState([
    {
      id: 'sg_a1',
      code: 'A1',
      mainGroup: 'المجموعة A',
      specialty: 'الطب الباطني والجراحة العامة',
      hospital: 'مستشفى الخليل الحكومي (عالية)',
      supervisor: 'د. طارق السعيد',
      capacity: 6,
      currentStudents: [
        { id: 1, name: 'أحمد محمود القواسمي', university_id: '22210466' },
        { id: 2, name: 'سارة يوسف النتشة', university_id: '22210467' },
        { id: 3, name: 'علي عبد الحليم التميمي', university_id: '22210468' },
        { id: 4, name: 'مريم خالد شاهين', university_id: '22210469' },
      ],
    },
    {
      id: 'sg_a2',
      code: 'A2',
      mainGroup: 'المجموعة A',
      specialty: 'طب الأطفال والولادة',
      hospital: 'مستشفى الميزان التخصصي',
      supervisor: 'د. رانية الكرد',
      capacity: 6,
      currentStudents: [
        { id: 10, name: 'عمر عبد اللطيف الشريف', university_id: '22210470' },
        { id: 11, name: 'ياسمين خليل سدر', university_id: '22210471' },
        { id: 12, name: 'فادي إبراهيم الهشلمون', university_id: '22210472' },
        { id: 13, name: 'دنيا ماجد الجعبري', university_id: '22210473' },
        { id: 14, name: 'حمزة خالد النتشة', university_id: '22210474' },
        { id: 15, name: 'نور الدين بدر', university_id: '22210475' },
      ], // FULL
    },
    {
      id: 'sg_b1',
      code: 'B1',
      mainGroup: 'المجموعة B',
      specialty: 'النسائية والتوليد والخدج',
      hospital: 'مستشفى الأهلي التخصصي',
      supervisor: 'د. سامر عابدين',
      capacity: 6,
      currentStudents: [
        { id: 20, name: 'بلال مصطفى الكركي', university_id: '22210476' },
        { id: 21, name: 'هديل وسيم العويوي', university_id: '22210477' },
        { id: 22, name: 'طارق زياد القواسمي', university_id: '22210478' },
      ],
    },
    {
      id: 'sg_b2',
      code: 'B2',
      mainGroup: 'المجموعة B',
      specialty: 'طوارئ جراحة وتخدير',
      hospital: 'مستشفى دورا الحكومي',
      supervisor: 'د. صابرين رجوب',
      capacity: 6,
      currentStudents: [
        { id: 30, name: 'رغد عبد المنعم زاهدة', university_id: '22210479' },
        { id: 31, name: 'سامي رياض عساف', university_id: '22210480' },
      ],
    },
  ]);

  const handleRegisterSeat = (groupId: string) => {
    setSelectedGroupId(groupId);
    setSuccessMessage('تم حجز مقعدك بنجاح في الشعبة المحددة وتأكيد تسجيلك عبر البورتال الجامعي!');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleSwapSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSwapModalOpen(false);
    setSuccessMessage('تم إرسال طلب التبادل بنجاح إلى الطالب المحدد وبانتظار موافقته وإقرار رئيس القسم.');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* University Portal Connected Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-teal-900 via-slate-900 to-indigo-950 p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold border border-teal-500/30">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              متصل ببورتال جامعة الخليل (Hebron University Portal SSO)
            </div>
            <h1 className="text-xl md:text-2xl font-black">
              أهلاً بك، {user?.name || 'الطالب'} (السنة الخامسة - السريرية) 🎓
            </h1>
            <p className="text-xs text-slate-300">
              شاشة التسجيل الذاتي واختيار الشعب والمجموعات السريرية المتاحة لدفعتك الأكاديمية.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => setIsSwapModalOpen(true)}
              className="gap-2 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-bold text-xs shadow-md"
            >
              <ArrowRightLeft className="w-4 h-4" />
              طلب تبادل مجموعة مع طالب آخر
            </Button>
          </div>
        </div>
      </div>

      {/* Registration Window Banner */}
      <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-teal-900 flex items-center justify-between text-xs font-medium">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-teal-600 shrink-0" />
          <div>
            <span className="font-bold text-sm block">فترة التسجيل الذاتي للمجموعات السريرية مفتوحة حالياً 🟢</span>
            <span>متاحة لطلبة السنة الخامسة من 01/09/2026 الساعة 08:00 صباحاً وحتى 05/09/2026 الساعة 11:59 مساءً</span>
          </div>
        </div>
        <span className="px-3 py-1 rounded-xl bg-teal-600 text-white font-bold text-[11px] shrink-0">
          دورة التناوب الأولى 2026/2027
        </span>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Available Groups Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600" />
          الشعب والمجموعات المتاحة لدفعة السنة الخامسة ({availableGroups.length} شعب)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableGroups.map((grp) => {
            const isSelected = selectedGroupId === grp.id;
            const isFull = grp.currentStudents.length >= grp.capacity;

            return (
              <Card
                key={grp.id}
                className={`p-6 border transition-all space-y-4 flex flex-col justify-between ${
                  isSelected
                    ? 'border-2 border-teal-500 bg-teal-50/30 shadow-md'
                    : isFull
                    ? 'border-slate-200 bg-slate-50/50 opacity-80'
                    : 'border-slate-100 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-teal-600 text-white font-black text-xs flex items-center justify-center">
                        {grp.code}
                      </span>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{grp.mainGroup} - الشعبة الفرعية ({grp.code})</h4>
                        <span className="text-[11px] text-slate-500 font-medium">{grp.specialty}</span>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        isFull
                          ? 'bg-red-100 text-red-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {grp.currentStudents.length} / {grp.capacity} طلاب {isFull ? '(مكتملة)' : '(متاحة)'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-teal-600" />
                      <span>المستشفى: <b>{grp.hospital}</b></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
                      <span>المشرف السريري: <b>{grp.supervisor}</b></span>
                    </div>
                  </div>

                  {/* Registered Students List inside subgroup */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block">الطلبة المسجلون حالياً بهذه الشعبة:</span>
                    <div className="flex flex-wrap gap-1">
                      {grp.currentStudents.map((st) => (
                        <span key={st.id} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {st.name} ({st.university_id})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  {isSelected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200">
                      <Check className="w-4 h-4 stroke-[3]" />
                      أنت مسجل حالياً بهذه الشعبة
                    </span>
                  ) : isFull ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">
                      <Lock className="w-3.5 h-3.5" />
                      الشعبة مكتملة السعة
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleRegisterSeat(grp.id)}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl"
                    >
                      تسجيل بالمجموعة {grp.code}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Student Group Swap Modal */}
      <Modal isOpen={isSwapModalOpen} onClose={() => setIsSwapModalOpen(false)} title="تقديم طلب تبادل شعبة مع طالب آخر">
        <form onSubmit={handleSwapSubmit} className="space-y-4">
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
            أنت مسجل حالياً في الشعبة الفرعية <b>A1</b>. أدخل الرقم الجامعي أو اسم الطالب الذي تريد التبادل معه.
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الجامعي أو اسم الطالب المستهدف</label>
            <input
              type="text"
              required
              placeholder="مثال: 22210476 أو بلال مصطفى"
              value={targetStudentId}
              onChange={(e) => setTargetStudentId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">سبب التبادل / ملاحظات إضافية</label>
            <textarea
              rows={3}
              placeholder="سبب طلب التبادل..."
              value={swapNotes}
              onChange={(e) => setSwapNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsSwapModalOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs">
              إرسال طلب التبادل
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
