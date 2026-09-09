import { ApiError } from '@/api/client';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type Student = { id:number; university_number:string; full_name_ar:string; full_name_en?:string|null };
export type EvaluationWeek = { number:number; start_date:string; end_date:string };
export type Criterion = { id:number; code:string; name_ar:string; name_en?:string|null; max_score:string|number };
export type AssessmentTemplate = { id:number; name_ar:string; name_en?:string|null; course_id?:number|null; version:number; is_active?:boolean; total_score:string|number; criteria:Criterion[] };
export type Assignment = { id:number; distribution_version_id:number; rotation_block_id:number|null; training_site_id:number|null; student_subgroup_id:number|null; session_start_date?:string|null; session_end_date?:string|null; scheduled_dates?:string[]; evaluation_weeks?:EvaluationWeek[]; student:Student; student_subgroup?:{name:string;group?:{name:string}}|null; rotation_block?:{block_code:string;from_week?:number|null;to_week?:number|null;rotation?:{name?:string;start_date?:string|null;course?:{id:number;code?:string;name_ar?:string;name_en?:string};academic_year?:{code:string};clinical_period?:{id:number;code:string;name_ar:string;name_en?:string|null;sequence:number}|null}}|null; training_site?:{name_ar:string;name_en?:string|null}|null; department?:{name_ar:string;name_en?:string|null}|null };
export type AttendanceRecord = { student_id:number; status:AttendanceStatus; excuse_note?:string|null; session?:{rotation_block_id:number|null;session_date:string}|null };
export type CriterionScore = { criterion_id:number; code?:string; name_ar?:string; name_en?:string|null; max_score:number; score:number };
export type Assessment = { id:number; student_id:number; student_clinical_assignment_id?:number|null; evaluation_week?:number|null; score:string|number|null; max_score:string|number|null; criteria_scores?:CriterionScore[]|null; status:string; notes?:string|null; return_reason?:string|null; created_at:string; student?:Student; session?:{rotation_block_id:number|null;session_date:string}|null };
export type SupervisorStudentNote = { id:number; supervisor_person_id:number; student_id:number; student_clinical_assignment_id?:number|null; rotation_block_id?:number|null; training_site_id?:number|null; note_date:string; note:string; created_at:string; updated_at:string };
export type Workspace = { supervisor:{full_name_ar:string;full_name_en:string}; assignments:Assignment[]; attendance_records:AttendanceRecord[]; assessments:Assessment[]; student_notes:SupervisorStudentNote[]; assessment_templates:AssessmentTemplate[]; schedule_configured:boolean };
export type SupervisorGroup = { key:string; assignmentId:number; studentAssignmentIds:Record<number,number>; rotationBlockId:number|null; courseId:number|null; courseAr:string; courseEn:string; courseCode:string; subgroup:string; group:string; clinicalPeriodAr:string;clinicalPeriodEn:string;periodAr:string;periodEn:string;siteAr:string;siteEn:string;departmentAr:string;departmentEn:string;academicYear:string;startDate:string;endDate:string;scheduledDates:string[];evaluationWeeks:EvaluationWeek[];students:Student[] };

export const workspaceQueryKey = ['supervisor-workspace'] as const;
export const dateValue = (date:Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const today = () => dateValue(new Date());
export const clampDate = (group:SupervisorGroup,value:string) => group.startDate&&value<group.startDate?group.startDate:group.endDate&&value>group.endDate?group.endDate:value;
export const studentName = (student:Student,ar:boolean) => ar ? student.full_name_ar : student.full_name_en || student.full_name_ar;
export const groupName = (group:SupervisorGroup,ar:boolean) => `${ar?group.courseAr:group.courseEn} — ${group.group} (${group.subgroup})`;
export const formatDate = (value:string,ar:boolean) => new Intl.DateTimeFormat(ar?'ar-PS':'en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`));
export const preferredDate = (dates:string[]) => dates.find(date=>date>=today()) ?? dates.at(-1) ?? '';
export const templateForGroup = (templates:AssessmentTemplate[],group:SupervisorGroup) => templates.find(item=>item.course_id===group.courseId) ?? templates.find(item=>!item.course_id);

export function supervisorErrorMessage(error:unknown,ar:boolean,fallback:string){
  if(!(error instanceof ApiError))return fallback;
  const first=Object.values(error.errors??{}).flatMap(value=>Array.isArray(value)?value:[value]).find(value=>typeof value==='string');
  const message=String(first??error.message??'');
  if(!ar)return message||fallback;
  if(message.includes('Every student in the selected group'))return 'يجب رصد جميع طلبة المجموعة قبل الإرسال.';
  if(message.includes('already has')||message.includes('مرسل أو معتمد'))return 'يوجد تقييم أسبوعي مرسل أو معتمد مسبقاً ولا يمكن تكراره.';
  return message||fallback;
}

export function groupSupervisorAssignments(assignments:Assignment[]):SupervisorGroup[]{
  const map=new Map<string,SupervisorGroup>();
  for(const item of assignments){
    const key=[item.distribution_version_id,item.rotation_block_id??'x',item.training_site_id??'x',item.student_subgroup_id??'x'].join('-');
    const block=item.rotation_block,rotation=block?.rotation;
    const fallbackWeeks:EvaluationWeek[]=[];
    if(!(item.evaluation_weeks??[]).length&&rotation?.start_date&&block?.from_week&&block?.to_week){for(let week=Number(block.from_week);week<=Number(block.to_week);week++){const start=new Date(`${String(rotation.start_date).slice(0,10)}T12:00:00`);start.setDate(start.getDate()+(week-1)*7);const end=new Date(start);end.setDate(end.getDate()+6);fallbackWeeks.push({number:week,start_date:dateValue(start),end_date:dateValue(end)});}}
    if(!map.has(key))map.set(key,{key,assignmentId:item.id,studentAssignmentIds:{},rotationBlockId:item.rotation_block_id,courseId:rotation?.course?.id??null,courseAr:rotation?.course?.name_ar??rotation?.name??'المساق السريري',courseEn:rotation?.course?.name_en??rotation?.name??'Clinical course',courseCode:rotation?.course?.code??'',subgroup:item.student_subgroup?.name??'—',group:item.student_subgroup?.group?.name??item.student_subgroup?.name??'—',clinicalPeriodAr:rotation?.clinical_period?.name_ar??'جدول سنوي',clinicalPeriodEn:rotation?.clinical_period?.name_en??rotation?.clinical_period?.name_ar??'Annual schedule',periodAr:block?.from_week&&block?.to_week?`الأسبوع ${block.from_week}–${block.to_week}`:block?.block_code??'الفترة الحالية',periodEn:block?.from_week&&block?.to_week?`Week ${block.from_week}–${block.to_week}`:block?.block_code??'Current period',siteAr:item.training_site?.name_ar??'غير محدد',siteEn:item.training_site?.name_en??item.training_site?.name_ar??'Not specified',departmentAr:item.department?.name_ar??'غير محدد',departmentEn:item.department?.name_en??item.department?.name_ar??'Not specified',academicYear:rotation?.academic_year?.code??'—',startDate:item.session_start_date??'',endDate:item.session_end_date??'',scheduledDates:item.scheduled_dates??[],evaluationWeeks:(item.evaluation_weeks??[]).length?item.evaluation_weeks!:fallbackWeeks,students:[]});
    const group=map.get(key)!;
    group.studentAssignmentIds[item.student.id]=item.id;
    group.scheduledDates=[...new Set([...group.scheduledDates,...(item.scheduled_dates??[])])].sort();
    if(!group.students.some(student=>student.id===item.student.id))group.students.push(item.student);
  }
  return [...map.values()];
}
