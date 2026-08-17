<?php

namespace App\Console\Commands;

use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\ClinicalSession;
use App\Models\Course;
use App\Models\AttendanceRecord;
use App\Models\GradeEntry;
use App\Models\StudentCourseEnrollment;
use App\Models\QualitySurvey;
use App\Models\QualitySurveyQuestion;
use App\Models\QualityImprovementPlan;
use App\Models\QualityKpi;
use App\Models\Correspondence;
use App\Models\Meeting;
use App\Models\MeetingActionItem;
use App\Models\StaffActivityRecord;
use App\Models\StaffAssignmentHistory;
use App\Models\SupervisorAvailability;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\StudentGroupAssignment;
use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use App\Models\StudyPlan;
use App\Models\CourseAssessmentComponent;
use App\Models\CourseLearningOutcome;
use App\Models\CourseProgramOutcomeMapping;
use App\Models\SkillLogbookRequirement;
use App\Models\ResearchProject;
use App\Models\ExternalElective;
use App\Models\AdvisingRecord;
use App\Models\AdvisingParticipant;
use App\Models\QualitySurveyResponse;
use App\Models\Student;
use App\Models\TrainingSite;
use App\Models\Partnership;
use App\Models\AcademicCalendarEvent;
use App\Models\SupervisorAnnualWorkload;
use App\Models\EvaluationFormVersion;
use App\Models\EvaluationFormItem;
use App\Models\AnnualReportEntry;
use App\Models\WeeklySupervisorAllocation;
use Illuminate\Console\Command;
use PhpOffice\PhpSpreadsheet\IOFactory;

class ImportClinicalCoreData extends Command
{
    protected $signature = 'clinical:import-core {--source= : Full Excel workbook path} {--dry-run : Validate only without database writes}';
    protected $description = 'Import academic years and departments from the approved clinical data workbook.';

    public function handle(): int
    {
        $source = $this->option('source') ?: 'C:\\Users\\Abdallh\\Downloads\\بيانات_الدائرة_السريرية_الشاملة (1).xlsx';
        if (!is_file($source)) { $this->error("Workbook not found: {$source}"); return self::FAILURE; }
        $book = IOFactory::load($source); $dryRun = (bool) $this->option('dry-run'); $years = 0; $departments = 0; $sites = 0; $students = 0; $people = 0; $rotations = 0; $blocks = 0; $sessions = 0; $courses = 0; $attendance = 0; $grades = 0; $surveys = 0; $questions = 0; $plans = 0; $kpis = 0; $correspondence = 0; $meetings = 0; $actions = 0; $activities = 0; $groupAssignments = 0; $placements = 0; $studyPlans = 0;
        foreach ($book->getSheetByName('44_السنوات_الأكاديمية')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0])) continue;
            $data = ['code'=>(string)$row[0], 'start_date'=>$row[1], 'end_date'=>$row[2], 'semester1_start'=>$row[3], 'semester1_end'=>$row[4], 'semester2_start'=>$row[5], 'semester2_end'=>$row[6], 'summer_start'=>$row[7], 'summer_end'=>$row[8], 'is_current'=>in_array(mb_strtolower((string)$row[9]), ['نعم','yes','1'], true), 'status'=>(string)($row[10] ?: 'active'), 'notes'=>$row[11] ?: null];
            if (!$dryRun) AcademicYear::updateOrCreate(['code'=>$data['code']], $data); $years++;
        }
        foreach ($book->getSheetByName('13_الأقسام')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0])) continue;
            $levels = $row[6] ? preg_split('/[,،]/u', (string)$row[6], -1, PREG_SPLIT_NO_EMPTY) : null;
            $type = in_array(mb_strtolower(trim((string)$row[3])), ['فرعي', 'sub'], true) ? 'sub' : 'primary';
            $data = ['code'=>(string)$row[0], 'name_ar'=>(string)$row[1], 'name_en'=>(string)($row[2] ?: $row[1]), 'dept_type'=>$type, 'serves_academic_levels'=>$levels, 'is_active'=>true, 'notes'=>$row[7] ?: null];
            if (!$dryRun) Department::updateOrCreate(['code'=>$data['code']], $data); $departments++;
        }
        foreach ($book->getSheetByName('14_مواقع_التدريب_وطاقتها')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0])) continue;
            $rawType = mb_strtolower(trim((string)$row[3])); $siteType = str_contains($rawType, 'أهلي') || str_contains($rawType, 'private') ? 'hospital_private' : (str_contains($rawType, 'مركز') || str_contains($rawType, 'center') ? 'medical_center' : (str_contains($rawType, 'عياد') || str_contains($rawType, 'clinic') ? 'clinic' : (str_contains($rawType, 'مختبر') || str_contains($rawType, 'lab') ? 'lab' : 'hospital_public')));
            $data=['site_code'=>(string)$row[0],'name_ar'=>(string)$row[1],'name_en'=>$row[2] ?: null,'site_type'=>$siteType,'city'=>$row[4] ?: null,'address'=>$row[5] ?: null,'latitude'=>is_numeric($row[6])?$row[6]:null,'longitude'=>is_numeric($row[7])?$row[7]:null,'distance_km'=>is_numeric($row[8])?$row[8]:null,'coordinator_name'=>$row[9] ?: null,'coordinator_phone'=>$row[10] ?: null,'coordinator_email'=>$row[11] ?: null,'is_active'=>true];
            if (!$dryRun) TrainingSite::updateOrCreate(['site_code'=>$data['site_code']],$data); $sites++;
        }
        foreach (['02_طلاب_السنة_الرابعة'=>'fourth','03_طلاب_السنة_الخامسة'=>'fifth','04_طلاب_السنة_السادسة'=>'sixth'] as $sheet=>$level) foreach ($book->getSheetByName($sheet)->toArray(null,true,true,false) as $index=>$row) {
            if ($index===0 || blank($row[0])) continue;
            $data=['university_number'=>(string)$row[0],'full_name_ar'=>(string)$row[1],'full_name_en'=>$row[2] ?: null,'national_id'=>$row[3] ?: null,'gender'=>in_array(mb_strtolower((string)$row[4]),['أنثى','female'])?'female':'male','date_of_birth'=>$row[5] ?: null,'city'=>$row[6] ?: null,'phone'=>$row[7] ?: null,'guardian_phone'=>$row[8] ?: null,'university_email'=>$row[9] ?: null,'photo_url'=>$row[10] ?: null,'batch_year'=>is_numeric($row[11])?(int)$row[11]:null,'academic_level'=>$level,'registration_status'=>'active','warning_count'=>0,'clinical_fees_status'=>'unknown','has_amboss_subscription'=>false,'data_source'=>'clinical-workbook'];
            if (!$dryRun) Student::updateOrCreate(['university_number'=>$data['university_number']],$data); $students++;
        }
        foreach ($book->getSheetByName('08_الطاقم_والمشرفون')->toArray(null,true,true,false) as $index=>$row) {
            if ($index===0 || blank($row[0])) continue;
            $departmentId = Department::where('name_ar',(string)$row[4])->value('id'); $siteId = TrainingSite::where('name_ar',(string)$row[5])->value('id');
            $rawContract=mb_strtolower(trim((string)$row[9])); $contractType=str_contains($rawContract,'غير متفرغ')||str_contains($rawContract,'part')?'part_time':(str_contains($rawContract,'زائر')?'visiting':(str_contains($rawContract,'شرف')?'honorary':'full_time'));
            $data=['staff_code'=>(string)$row[0],'full_name_ar'=>(string)$row[1],'full_name_en'=>$row[2] ?: null,'department_id'=>$departmentId,'primary_site_id'=>$siteId,'specialty'=>$row[6] ?: null,'academic_degree'=>$row[7] ?: null,'license_number'=>$row[8] ?: null,'contract_type'=>$contractType,'contract_start'=>$row[10] ?: null,'contract_end'=>$row[11] ?: null,'is_active'=>true];
            if (!$dryRun) Person::updateOrCreate(['staff_code'=>$data['staff_code']],$data); $people++;
        }
        foreach ($book->getSheetByName('24_الروتيشنات_والبلوكات')->toArray(null,true,true,false) as $index=>$row) {
            if ($index===0 || blank($row[3])) continue; $yearId=AcademicYear::where('code',(string)$row[0])->value('id'); $level=match((string)$row[1]){'الرابعة'=>'fourth','الخامسة'=>'fifth','السادسة'=>'sixth',default=>'fourth'}; $code=(string)$row[3];
            $code = $level.'-'.$code; $data=['academic_year_id'=>$yearId,'code'=>$code,'name'=>(string)($row[4]?:$code),'academic_level'=>$level,'duration_weeks'=>is_numeric($row[10])?(int)$row[10]:null,'start_date'=>$row[6]?:null,'end_date'=>$row[7]?:null,'status'=>'active'];
            $rotation=$dryRun?null:Rotation::updateOrCreate(['academic_year_id'=>$yearId,'code'=>$code],$data);$rotations++;
            if (!blank($row[5])) { $dept=Department::where('code',(string)($row[12]??''))->value('id'); if(!$dryRun) RotationBlock::updateOrCreate(['rotation_id'=>$rotation->id,'block_code'=>(string)$row[5]],['from_week'=>is_numeric($row[8])?(int)$row[8]:null,'to_week'=>is_numeric($row[9])?(int)$row[9]:null,'department_id'=>$dept]); $blocks++; }
        }
        foreach ($book->getSheetByName('27_الجلسات_السريرية')->toArray(null,true,true,false) as $index=>$row) { if($index===0||blank($row[2]))continue; $siteId=TrainingSite::where('site_code',(string)$row[8])->value('id'); $title=(string)($row[11] ?: 'جلسة سريرية'); if(!$dryRun) ClinicalSession::firstOrCreate(['session_date'=>$row[2],'title'=>$title,'training_site_id'=>$siteId]); $sessions++; }
        foreach ($book->getSheetByName('16_المساقات_السريرية')->toArray(null,true,true,false) as $index=>$row) { if($index===0||blank($row[0]))continue; $level=match((string)$row[3]){'الرابعة'=>'fourth','الخامسة'=>'fifth','السادسة'=>'sixth',default=>null}; $data=['code'=>(string)$row[0],'name_ar'=>(string)$row[1],'name_en'=>$row[2]?:null,'academic_level'=>$level,'credit_hours'=>is_numeric($row[5])?$row[5]:1,'is_active'=>true]; if(!$dryRun) Course::updateOrCreate(['code'=>$data['code']],$data);$courses++; }
        foreach ($book->getSheetByName('28_الحضور_والدوام')->toArray(null,true,true,false) as $index=>$row) { if($index===0||blank($row[0])||blank($row[1]))continue; $student=Student::where('university_number',(string)$row[1])->first(); if(!$student)continue; $siteId=TrainingSite::where('site_code',(string)$row[5])->value('id'); $title=(string)($row[7]?:'جلسة سريرية'); $session=$dryRun?null:ClinicalSession::firstOrCreate(['session_date'=>$row[0],'title'=>$title,'training_site_id'=>$siteId]); $raw=mb_strtolower((string)$row[8]); $status=str_contains($raw,'غائب')?'absent':(str_contains($raw,'متأخر')?'late':(str_contains($raw,'عذر')?'excused':'present')); if(!$dryRun) AttendanceRecord::updateOrCreate(['clinical_session_id'=>$session->id,'student_id'=>$student->id],['status'=>$status,'excuse_note'=>$row[11]?:null]);$attendance++; }
        foreach ($book->getSheetByName('29_العلامات')->toArray(null,true,true,false) as $index=>$row) { if($index===0||blank($row[2])||blank($row[4]))continue; $student=Student::where('university_number',(string)$row[2])->first();$course=Course::where('code',(string)$row[4])->first();if(!$student||!$course)continue;$yearId=AcademicYear::where('code',(string)$row[0])->value('id');$enrollment=$dryRun?null:StudentCourseEnrollment::firstOrCreate(['student_id'=>$student->id,'course_id'=>$course->id,'academic_year_id'=>$yearId,'semester'=>(string)($row[1]?:'unknown')],['status'=>'active']);if(!$dryRun)GradeEntry::updateOrCreate(['student_course_enrollment_id'=>$enrollment->id],['score'=>is_numeric($row[6])?$row[6]:null,'max_score'=>is_numeric($row[7])?$row[7]:100,'status'=>'draft','notes'=>$row[5]?:null]);$grades++; }
        foreach ($book->getSheetByName('35_استبيانات_الجودة')->toArray(null,true,true,false) as $index=>$row) { if($index===0||blank($row[0]))continue;$mandatory=in_array(mb_strtolower((string)$row[8]),['نعم','yes','1'],true);$data=['code'=>(string)$row[0],'title'=>(string)$row[1],'target_group'=>(string)($row[2]?:'general'),'purpose'=>$row[3]?:null,'frequency'=>$row[4]?:null,'responsible'=>$row[6]?:null,'form_url'=>$row[7]?:null,'is_mandatory'=>$mandatory,'notes'=>$row[9]?:null,'is_active'=>true];if(!$dryRun)QualitySurvey::updateOrCreate(['code'=>$data['code']],$data);$surveys++;}
        foreach ($book->getSheetByName('36_أسئلة_استبيانات_الجودة')->toArray(null,true,true,false) as $index=>$row) {if($index===0||blank($row[0])||!is_numeric($row[2]))continue;$survey=QualitySurvey::where('code',(string)$row[0])->first();if(!$survey)continue;$data=['quality_survey_id'=>$survey->id,'version'=>(string)($row[1]?:'1'),'question_number'=>(int)$row[2],'question_text'=>(string)$row[3],'question_type'=>(string)($row[4]?:'text'),'options'=>$row[5]?:null,'is_required'=>in_array(mb_strtolower((string)$row[6]),['نعم','yes','1'],true),'weight'=>is_numeric($row[7])?$row[7]:null,'axis'=>$row[8]?:null,'active_from'=>$row[9]?:null,'active_until'=>$row[10]?:null];if(!$dryRun)QualitySurveyQuestion::updateOrCreate(['quality_survey_id'=>$survey->id,'version'=>$data['version'],'question_number'=>$data['question_number']],$data);$questions++;}
        foreach ($book->getSheetByName('38_خطط_تحسين_الجودة')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[4]))continue;$data=['academic_year'=>$row[1]?:null,'source'=>$row[2]?:null,'reference'=>$row[3]?:null,'observation'=>(string)$row[4],'improvement_action'=>(string)($row[5]?:'غير محدد'),'responsible'=>$row[6]?:null,'start_date'=>$row[7]?:null,'due_date'=>$row[8]?:null,'priority'=>in_array($row[9],['low','normal','high'])?$row[9]:'normal','status'=>$row[10]?:'open','closed_date'=>$row[11]?:null,'closure_evidence'=>$row[12]?:null,'verification_result'=>$row[13]?:null,'data_source'=>$row[14]?:null];if(!$dryRun)QualityImprovementPlan::firstOrCreate(['observation'=>$data['observation'],'improvement_action'=>$data['improvement_action']],$data);$plans++;}
        foreach ($book->getSheetByName('39_مؤشرات_الأداء')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[0]))continue;$data=['code'=>(string)$row[0],'name'=>(string)$row[1],'category'=>$row[2]?:null,'measurement_method'=>$row[3]?:null,'data_source'=>$row[4]?:null,'weight'=>is_numeric($row[5])?$row[5]:null,'target_value'=>$row[6]?:null,'measurement_frequency'=>$row[7]?:null,'responsible'=>$row[8]?:null];if(!$dryRun)QualityKpi::updateOrCreate(['code'=>$data['code']],$data);$kpis++;}
        foreach ($book->getSheetByName('40_المراسلات')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[0]))continue;$raw=mb_strtolower((string)$row[2]);$direction=str_contains($raw,'صادر')?'outgoing':'incoming';$data=['reference_number'=>(string)$row[0],'correspondence_date'=>$row[1]?:now()->toDateString(),'direction'=>$direction,'subject'=>(string)($row[5]?:'مراسلة'),'counterparty'=>$row[4]?:$row[3]?:null,'summary'=>$row[9]?:null,'status'=>'draft'];if(!$dryRun)Correspondence::updateOrCreate(['reference_number'=>$data['reference_number']],$data);$correspondence++;}
        foreach($book->getSheetByName('41_الاجتماعات_والقرارات')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[0]))continue;$data=['minutes_number'=>(string)$row[0],'meeting_type'=>(string)($row[1]?:'اجتماع'),'meeting_date'=>$row[2]?:now()->toDateString(),'meeting_time'=>$row[3]?:null,'location'=>$row[4]?:null,'chairperson'=>$row[5]?:null,'attendees'=>$row[6]?:null,'absentees'=>$row[7]?:null,'agenda'=>$row[8]?:null,'discussion_summary'=>$row[9]?:null,'decisions_summary'=>$row[10]?:null,'implementation_owner'=>$row[11]?:null];if(!$dryRun)Meeting::updateOrCreate(['minutes_number'=>$data['minutes_number']],$data);$meetings++;}
        foreach($book->getSheetByName('42_مهام_وقرارات_الاجتماعات')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[1])||blank($row[3]))continue;$meeting=Meeting::where('minutes_number',(string)$row[1])->first();if(!$meeting)continue;$type=match((string)$row[2]){'قرار'=>'decision','توصية'=>'recommendation',default=>'task'};$data=['item_type'=>$type,'description'=>(string)$row[3],'responsible'=>$row[4]?:null,'executing_entity'=>$row[5]?:null,'priority'=>in_array($row[6],['low','normal','high'])?$row[6]:'normal','due_date'=>$row[7]?:null,'status'=>$row[8]?:'open','completed_date'=>$row[9]?:null,'completion_evidence'=>$row[10]?:null,'notes'=>$row[11]?:null];if(!$dryRun)MeetingActionItem::firstOrCreate(['meeting_id'=>$meeting->id,'description'=>$data['description']],$data);$actions++;}
        foreach($book->getSheetByName('09_سجل_أنشطة_الطاقم')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[0])||blank($row[2]))continue;$person=Person::where('staff_code',(string)$row[0])->first();if(!$person)continue;$data=['person_id'=>$person->id,'activity_type'=>(string)$row[2],'title'=>(string)($row[3]?:$row[2]),'organizer'=>$row[4]?:null,'activity_date'=>$row[5]?:null,'location'=>$row[6]?:null,'role'=>$row[7]?:null,'duration'=>$row[8]?:null,'evidence_url'=>$row[9]?:null,'points'=>is_numeric($row[10])?$row[10]:null,'academic_year'=>$row[11]?:null,'notes'=>$row[12]?:null];if(!$dryRun)StaffActivityRecord::firstOrCreate(['person_id'=>$person->id,'activity_type'=>$data['activity_type'],'title'=>$data['title'],'activity_date'=>$data['activity_date']],$data);$activities++;}
        foreach($book->getSheetByName('10_تاريخ_تكليفات_الطاقم')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[1]))continue;$person=Person::where('staff_code',(string)$row[1])->first();if(!$person)continue;$dept=Department::where('name_ar',(string)$row[3])->value('id');$site=TrainingSite::where('name_ar',(string)$row[4])->value('id');$data=['person_id'=>$person->id,'role_type'=>$row[2]?:null,'department_id'=>$dept,'training_site_id'=>$site,'start_date'=>$row[5]?:null,'end_date'=>$row[6]?:null,'reference'=>$row[7]?:null,'status'=>$row[8]?:null,'notes'=>$row[9]?:null];if(!$dryRun)StaffAssignmentHistory::firstOrCreate(['person_id'=>$person->id,'start_date'=>$data['start_date'],'role_type'=>$data['role_type']],$data);}
        foreach($book->getSheetByName('12_توفر_المشرفين')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[1]))continue;$person=Person::where('staff_code',(string)$row[1])->first();if(!$person)continue;$dept=Department::where('name_ar',(string)$row[7])->value('id');$site=TrainingSite::where('name_ar',(string)$row[8])->value('id');$data=['person_id'=>$person->id,'academic_year'=>$row[0]?:null,'available_from'=>$row[2]?:null,'available_until'=>$row[3]?:null,'day'=>$row[4]?:null,'from_time'=>$row[5]?:null,'until_time'=>$row[6]?:null,'department_id'=>$dept,'training_site_id'=>$site,'status'=>$row[9]?:null,'reason'=>$row[10]?:null,'notes'=>$row[11]?:null];if(!$dryRun)SupervisorAvailability::firstOrCreate(['person_id'=>$person->id,'available_from'=>$data['available_from'],'day'=>$data['day']],$data);}
        foreach($book->getSheetByName('07_تكليفات_الطلاب_بالمجموعات')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[2])||blank($row[5]))continue;$student=Student::where('university_number',(string)$row[2])->first();$year=AcademicYear::where('code',(string)$row[1])->first();if(!$student||!$year)continue;$level=match((string)$row[3]){'الرابعة'=>'fourth','الخامسة'=>'fifth','السادسة'=>'sixth',default=>$student->academic_level};$group=$dryRun?null:StudentGroup::firstOrCreate(['academic_year_id'=>$year->id,'academic_level'=>$level,'name'=>(string)$row[5]],['notes'=>'Imported from clinical workbook']);$subgroup=(!$dryRun&&filled($row[6]))?StudentSubgroup::firstOrCreate(['student_group_id'=>$group->id,'name'=>(string)$row[6]],['is_active'=>true]):null;$data=['assignment_code'=>$row[0]?:null,'student_id'=>$student->id,'academic_year_id'=>$year->id,'student_group_id'=>$group?->id,'student_subgroup_id'=>$subgroup?->id,'rotation'=>$row[4]?:null,'valid_from'=>$row[7]?:null,'valid_until'=>$row[8]?:null,'change_reason'=>$row[9]?:null,'approved_by'=>$row[10]?:null,'notes'=>$row[11]?:null,'data_source'=>'clinical-workbook'];if(!$dryRun)StudentGroupAssignment::updateOrCreate(['student_id'=>$student->id,'academic_year_id'=>$year->id,'rotation'=>$data['rotation']],$data);$groupAssignments++;}
        foreach($book->getSheetByName('25_جدول_التوزيع')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[0])||blank($row[4])||blank($row[2]))continue;$year=AcademicYear::where('code',(string)$row[0])->first();if(!$year)continue;$level=match((string)$row[1]){'الرابعة'=>'fourth','الخامسة'=>'fifth','السادسة'=>'sixth',default=>'fourth'};$rotation=Rotation::where('academic_year_id',$year->id)->where('code',$level.'-'.(string)$row[4])->first();if(!$rotation)continue;$dept=Department::where('name_ar',(string)$row[10])->first();$site=TrainingSite::where('site_code',(string)$row[11])->first();$group=StudentGroup::where(['academic_year_id'=>$year->id,'academic_level'=>$level,'name'=>(string)$row[2]])->first();if(!$site||!$group)continue;$sub=filled($row[3])?StudentSubgroup::where(['student_group_id'=>$group->id,'name'=>(string)$row[3]])->first():null;if(filled($row[3])&&!$sub)continue;$version=$dryRun?null:DistributionVersion::firstOrCreate(['rotation_id'=>$rotation->id,'name'=>'Imported workbook distribution'],['status'=>'published','is_current'=>true]);$block=$dryRun?null:RotationBlock::firstOrCreate(['rotation_id'=>$rotation->id,'block_code'=>'IMP-'.($row[5]?:'0').'-'.($row[6]?:'0').'-'.($dept?->id?:'x')],['from_week'=>is_numeric($row[5])?(int)$row[5]:null,'to_week'=>is_numeric($row[6])?(int)$row[6]:null,'department_id'=>$dept?->id]);$studentsQuery=StudentGroupAssignment::where('academic_year_id',$year->id)->where('student_group_id',$group->id);if($sub)$studentsQuery->where('student_subgroup_id',$sub->id);foreach($studentsQuery->pluck('student_id') as $studentId){if(!$dryRun)StudentClinicalAssignment::updateOrCreate(['distribution_version_id'=>$version->id,'student_id'=>$studentId,'rotation_block_id'=>$block->id],['training_site_id'=>$site->id,'department_id'=>$dept?->id]);$placements++;}}
        foreach($book->getSheetByName('26_توزيع_الأطباء_الأسبوعي')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[0])||!is_numeric($row[1]))continue;$person=Person::where('staff_code',(string)$row[5])->first()??Person::where('full_name_ar',(string)$row[6])->first();$site=TrainingSite::where('site_code',(string)$row[4])->first();$dept=Department::where('name_ar',(string)$row[3])->first();$data=['academic_year'=>(string)$row[0],'week_number'=>(int)$row[1],'week_start'=>$row[2]?:null,'department_id'=>$dept?->id,'training_site_id'=>$site?->id,'person_id'=>$person?->id,'supervisor_name'=>$row[6]?:null,'subgroup'=>$row[7]?:null,'student_count'=>is_numeric($row[8])?(int)$row[8]:null,'notes'=>$row[9]?:null,'data_source'=>$row[10]?:'clinical-workbook'];if(!$dryRun)WeeklySupervisorAllocation::updateOrCreate(['academic_year'=>$data['academic_year'],'week_number'=>$data['week_number'],'department_id'=>$data['department_id'],'subgroup'=>$data['subgroup']],$data);if(!$dryRun&&$person&&$site)StudentClinicalAssignment::where('training_site_id',$site->id)->whereNull('supervisor_id')->update(['supervisor_id'=>$person->id]);}
        foreach($book->getSheetByName('20_إصدارات_الخطة_الدراسية')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[0]))continue;$data=['code'=>(string)$row[0],'name_ar'=>(string)($row[1]?:$row[0]),'name_en'=>null,'is_active'=>!in_array(mb_strtolower((string)$row[8]),['متوقفة','inactive'],true)];if(!$dryRun)StudyPlan::updateOrCreate(['code'=>$data['code']],$data);$studyPlans++;}
        foreach($book->getSheetByName('21_مساقات_الخطة')->toArray(null,true,true,false) as $index=>$row){if($index===0||blank($row[0])||blank($row[1]))continue;$plan=StudyPlan::where('code',(string)$row[0])->first();$course=Course::where('code',(string)$row[1])->first();if(!$plan||!$course)continue;$level=match((string)$row[2]){'الرابعة'=>'fourth','الخامسة'=>'fifth','السادسة'=>'sixth',default=>null};if(!$dryRun)$plan->courses()->syncWithoutDetaching([$course->id=>['academic_level'=>$level,'sequence'=>is_numeric($row[6])?(int)$row[6]:1,'is_required'=>!str_contains((string)$row[4],'اختياري')]]);}
        foreach($book->getSheetByName('17_مكونات_تقييم_المساق')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[0])||blank($r[2]))continue;$c=Course::where('code',(string)$r[0])->first();if(!$c)continue;if(!$dryRun)CourseAssessmentComponent::firstOrCreate(['course_id'=>$c->id,'name'=>(string)$r[2]],['weight'=>is_numeric($r[3])?$r[3]:null,'max_score'=>is_numeric($r[4])?$r[4]:null,'evaluator'=>$r[5]?:null,'timing'=>$r[6]?:null,'is_required_to_pass'=>in_array(mb_strtolower((string)$r[7]),['نعم','yes','1'],true),'notes'=>$r[8]?:null]);}
        foreach($book->getSheetByName('18_مخرجات_تعلم_المساقات_ILOs')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[0])||blank($r[1]))continue;$c=Course::where('code',(string)$r[0])->first();if(!$c)continue;$d=['course_id'=>$c->id,'outcome_code'=>(string)$r[1],'text_en'=>$r[2]?:null,'text_ar'=>$r[3]?:null,'domain'=>$r[4]?:null,'program_outcome'=>$r[5]?:null,'teaching_method'=>$r[6]?:null,'assessment_method'=>$r[7]?:null];if(!$dryRun)CourseLearningOutcome::updateOrCreate(['course_id'=>$c->id,'outcome_code'=>$d['outcome_code']],$d);}
        foreach($book->getSheetByName('19_مصفوفة_المساق_PLO')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[0]))continue;$c=Course::where('code',(string)$r[0])->first();if(!$c)continue;for($col=2;$col<=15;$col++){if(blank($r[$col]??null))continue;$code='PLO'.($col-1);if(!$dryRun)CourseProgramOutcomeMapping::updateOrCreate(['course_id'=>$c->id,'program_outcome_code'=>$code],['mapping_level'=>(string)$r[$col]]);}}
        foreach($book->getSheetByName('31_اللوج_بوك_المهارات')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[2]))continue;$c=Course::where('code',(string)$r[0])->first();$d=Department::where('name_ar',(string)$r[1])->first();$data=['course_id'=>$c?->id,'department_id'=>$d?->id,'skill_code'=>(string)$r[2],'name_ar'=>(string)$r[3],'name_en'=>$r[4]?:null,'required_proficiency'=>$r[5]?:null,'minimum_count'=>is_numeric($r[6])?(int)$r[6]:null,'requires_supervisor_signature'=>in_array(mb_strtolower((string)$r[7]),['نعم','yes','1'],true),'notes'=>$r[8]?:null];if(!$dryRun)SkillLogbookRequirement::updateOrCreate(['skill_code'=>$data['skill_code'],'course_id'=>$data['course_id']],$data);}
        foreach($book->getSheetByName('22_مشاريع_البحث')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[2]))continue;$c=Course::where('code',(string)$r[1])->first();$d=Department::where('name_ar',(string)$r[5])->first();$data=['academic_year'=>$r[0]?:null,'course_id'=>$c?->id,'title'=>(string)$r[2],'student_identifiers'=>$r[3]?:null,'supervisor'=>$r[4]?:null,'department_id'=>$d?->id,'ethical_approval_status'=>$r[6]?:null,'project_stage'=>$r[7]?:null,'submission_date'=>$r[8]?:null,'score'=>is_numeric($r[9])?$r[9]:null,'publication_status'=>$r[10]?:null,'notes'=>$r[11]?:null];if(!$dryRun)ResearchProject::firstOrCreate(['title'=>$data['title'],'academic_year'=>$data['academic_year']],$data);}
        foreach($book->getSheetByName('23_المساقات_الاختيارية_الخارجية')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[1]))continue;$s=Student::where('university_number',(string)$r[1])->first();$c=Course::where('code',(string)$r[3])->first();if(!$s)continue;$data=['academic_year'=>$r[0]?:null,'student_id'=>$s->id,'course_id'=>$c?->id,'organization'=>$r[4]?:null,'country'=>$r[5]?:null,'specialty'=>$r[6]?:null,'start_date'=>$r[7]?:null,'end_date'=>$r[8]?:null,'external_supervisor'=>$r[9]?:null,'approval_status'=>$r[10]?:null,'student_report'=>$r[11]?:null,'external_evaluation'=>$r[12]?:null,'score'=>is_numeric($r[13])?$r[13]:null,'recognition_status'=>null,'notes'=>null];if(!$dryRun)ExternalElective::updateOrCreate(['student_id'=>$s->id,'start_date'=>$data['start_date'],'organization'=>$data['organization']],$data);}
        foreach($book->getSheetByName('33_الإرشاد_الأكاديمي')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[0])||blank($r[6]))continue;$s=Student::where('university_number',(string)$r[6])->first();if(!$s)continue;$data=['student_id'=>$s->id,'advisor_person_id'=>Person::where('full_name_ar',(string)$r[5])->value('id'),'meeting_date'=>$r[2]?:now()->toDateString(),'category'=>'general','notes'=>(string)($r[10]?:$r[1]?:'جلسة إرشاد'),'action_plan'=>$r[11]?:null,'status'=>'open','meeting_number'=>(string)$r[0],'semester'=>$r[3]?:null,'academic_year'=>$r[4]?:null,'attendance_count'=>is_numeric($r[8])?(int)$r[8]:null,'absence_count'=>is_numeric($r[9])?(int)$r[9]:null,'follow_up_status'=>$r[12]?:null,'attachment_path'=>$r[13]?:null,'signed_at'=>$r[14]?:null];if(!$dryRun)AdvisingRecord::updateOrCreate(['student_id'=>$s->id,'meeting_number'=>$data['meeting_number']],$data);}
        foreach($book->getSheetByName('34_مشاركو_الإرشاد')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[1]))continue;$s=Student::where('university_number',(string)$r[1])->first();if(!$s)continue;$record=AdvisingRecord::where('student_id',$s->id)->latest('meeting_date')->first();if(!$record)continue;$data=['advising_record_id'=>$record->id,'student_id'=>$s->id,'participation_role'=>$r[3]?:null,'attendance_status'=>$r[4]?:null,'student_note'=>$r[5]?:null,'required_action'=>$r[6]?:null,'action_status'=>$r[7]?:null,'follow_up_date'=>$r[8]?:null];if(!$dryRun)AdvisingParticipant::updateOrCreate(['advising_record_id'=>$record->id,'student_id'=>$s->id],$data);}
        foreach($book->getSheetByName('37_استجابات_استبيانات_الجودة')->toArray(null,true,true,false) as $i=>$r){if($i===0||blank($r[1])||blank($r[10]))continue;$survey=QualitySurvey::where('code',(string)$r[1])->first();if(!$survey)continue;$question=QualitySurveyQuestion::where('quality_survey_id',$survey->id)->where('question_number',(int)$r[10])->first();if(!$question)continue;$data=['quality_survey_id'=>$survey->id,'quality_survey_question_id'=>$question->id,'version'=>(string)($r[2]?:'1'),'responded_at'=>$r[3]?:now(),'respondent_identifier'=>$r[4]?:null,'target_group'=>$r[5]?:null,'course_id'=>Course::where('code',(string)$r[6])->value('id'),'department_id'=>Department::where('name_ar',(string)$r[7])->value('id'),'training_site_id'=>TrainingSite::where('name_ar',(string)$r[8])->value('id'),'supervisor_person_id'=>Person::where('staff_code',(string)$r[9])->value('id'),'numeric_answer'=>is_numeric($r[11])?$r[11]:null,'text_answer'=>$r[12]?:null];if(!$dryRun)QualitySurveyResponse::firstOrCreate(['quality_survey_question_id'=>$question->id,'respondent_identifier'=>$data['respondent_identifier'],'responded_at'=>$data['responded_at']],$data);}
        foreach ($book->getSheetByName('05_الدفعات_والمجموعات')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0]) || blank($row[1]) || blank($row[4])) continue;
            $year = AcademicYear::where('code', (string) $row[0])->first();
            if (!$year) continue;
            $level = match ((string) $row[1]) { 'الرابعة' => 'fourth', 'الخامسة' => 'fifth', 'السادسة' => 'sixth', default => null };
            if (!$level) continue;
            $names = preg_split('/[,،]/u', (string) $row[4], -1, PREG_SPLIT_NO_EMPTY);
            foreach ($names as $name) {
                $name = trim($name);
                if ($name === '') continue;
                $groupData = [
                    'distribution_manager' => $row[8] ?: null,
                    'capacity' => is_numeric($row[7]) ? (int) $row[7] : null,
                    'group_type' => 'clinical',
                    'notes' => $row[10] ?: null,
                    'approved_at' => $row[9] ?: null,
                ];
                $group = $dryRun ? null : StudentGroup::updateOrCreate(
                    ['academic_year_id' => $year->id, 'academic_level' => $level, 'name' => $name],
                    $groupData,
                );
                if ($dryRun || !$group || blank($row[5])) continue;
                preg_match_all('/'.preg_quote($name, '/').'\\s*=\\s*(\\d+)/u', (string) $row[5], $matches);
                $subgroupCount = isset($matches[1][0]) ? (int) $matches[1][0] : 0;
                for ($number = 1; $number <= $subgroupCount; $number++) {
                    StudentSubgroup::firstOrCreate(
                        ['student_group_id' => $group->id, 'name' => $name.$number],
                        ['min_size' => is_numeric($row[6]) ? (int) $row[6] : null, 'max_size' => is_numeric($row[7]) ? (int) $row[7] : null, 'capacity' => is_numeric($row[7]) ? (int) $row[7] : null, 'is_active' => true],
                    );
                }
            }
        }
        foreach ($book->getSheetByName('06_الطلبة_المتعثرون')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[2])) continue;
            $student = Student::where('university_number', (string) $row[2])->first();
            if (!$student || $dryRun) continue;
            $advisorId = Person::where('full_name_ar', (string) $row[10])->value('id');
            $riskNotes = collect([$row[6] ? 'المشكلة الأكاديمية: '.$row[6] : null, $row[8] ? 'مساقات غير مجتازة: '.$row[8] : null, $row[9] ? 'خطة المعالجة: '.$row[9] : null, $row[12] ? 'نتيجة المتابعة: '.$row[12] : null])->filter()->implode("\n");
            $notes = $riskNotes !== '' && !str_contains((string) $student->notes, $riskNotes) ? collect([$student->notes, $riskNotes])->filter()->implode("\n") : $student->notes;
            $student->update([
                'gpa' => is_numeric($row[5]) ? $row[5] : $student->gpa,
                'warning_count' => is_numeric($row[7]) ? (int) $row[7] : $student->warning_count,
                'last_warning_date' => $row[11] ?: $student->last_warning_date,
                'academic_advisor_id' => $advisorId ?: $student->academic_advisor_id,
                'notes' => $notes ?: null,
            ]);
        }
        foreach ($book->getSheetByName('15_الاتفاقيات_والشراكات')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0])) continue;
            $scope = mb_strtolower((string) $row[2]) === 'دولي' ? 'international' : 'local';
            $data = ['institution_name' => (string) $row[0], 'purpose' => $row[1] ?: null, 'scope' => $scope, 'start_date' => $row[3] ?: null, 'end_date' => $row[4] ?: null, 'is_active' => true, 'notes' => $row[5] ?: null, 'data_source' => $row[6] ?: 'clinical-workbook'];
            if (!$dryRun) Partnership::updateOrCreate(['institution_name' => $data['institution_name']], $data);
        }
        foreach ($book->getSheetByName('43_التقويم_الأكاديمي')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[1]) || blank($row[3]) || blank($row[4])) continue;
            $yearId = AcademicYear::where('code', (string) $row[0])->value('id');
            $data = ['academic_year_id' => $yearId, 'name' => (string) $row[1], 'event_type' => (string) ($row[2] ?: 'academic'), 'start_date' => $row[3], 'end_date' => $row[4], 'affected_levels' => $row[5] ?: null, 'suspends_clinical_training' => in_array(mb_strtolower((string) $row[6]), ['نعم', 'yes', '1', 'true'], true), 'notes' => $row[7] ?: null];
            if (!$dryRun) AcademicCalendarEvent::updateOrCreate(['academic_year_id' => $yearId, 'name' => $data['name'], 'start_date' => $data['start_date']], $data);
        }
        foreach ($book->getSheetByName('11_عبء_الإشراف_السنوي')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0]) || blank($row[3])) continue;
            $level = match ((string) $row[1]) { 'الرابعة' => 'fourth', 'الخامسة' => 'fifth', 'السادسة' => 'sixth', default => null };
            $departmentId = Department::where('name_ar', (string) $row[2])->value('id');
            $personId = Person::where('staff_code', (string) $row[4])->value('id');
            $data = ['academic_year' => (string) $row[0], 'academic_level' => $level, 'department_id' => $departmentId, 'person_id' => $personId, 'supervisor_name' => (string) $row[3], 'supervisor_code' => $row[4] ?: null, 'supervision_weeks' => is_numeric($row[5]) ? (int) $row[5] : null, 'notes' => $row[6] ?: null, 'data_source' => $row[7] ?: 'clinical-workbook'];
            if (!$dryRun) SupervisorAnnualWorkload::updateOrCreate(['academic_year' => $data['academic_year'], 'academic_level' => $level, 'supervisor_code' => $data['supervisor_code'], 'department_id' => $departmentId], $data);
        }
        foreach ($book->getSheetByName('32_إصدارات_نماذج_التقييم')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0]) || blank($row[2])) continue;
            $status = in_array(mb_strtolower((string) $row[10]), ['فعال', 'active'], true) ? 'active' : 'inactive';
            $data = ['form_code' => (string) $row[0], 'name' => (string) ($row[1] ?: $row[0]), 'version' => (string) $row[2], 'department_id' => Department::where('code', (string) $row[3])->value('id'), 'course_id' => Course::where('code', (string) $row[4])->value('id'), 'evaluator_type' => $row[5] ?: null, 'evaluatee_type' => $row[6] ?: null, 'effective_from' => $row[7] ?: null, 'effective_until' => $row[8] ?: null, 'total_score' => is_numeric($row[9]) ? $row[9] : null, 'status' => $status, 'document_path' => $row[11] ?: null, 'notes' => $row[12] ?: null, 'data_source' => 'clinical-workbook'];
            if (!$dryRun) EvaluationFormVersion::updateOrCreate(['form_code' => $data['form_code'], 'version' => $data['version']], $data);
        }
        foreach ($book->getSheetByName('30_بنود_تقييم_المشرف_للطالب')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0]) || blank($row[1])) continue;
            $data = ['item_code' => (string) $row[0], 'item_text' => (string) $row[1], 'domain' => $row[2] ?: null, 'rating_scale' => $row[3] ?: null, 'weight' => is_numeric($row[4]) ? $row[4] : null, 'program_outcome_code' => $row[5] ?: null, 'applicable_courses' => $row[6] ?: null, 'notes' => $row[7] ?: null, 'data_source' => 'clinical-workbook'];
            if (!$dryRun) EvaluationFormItem::updateOrCreate(['item_code' => $data['item_code']], $data);
        }
        foreach ($book->getSheetByName('45_ملخص_التقرير_السنوي')->toArray(null, true, true, false) as $index => $row) {
            if ($index === 0 || blank($row[0]) || blank($row[1])) continue;
            $data = ['category' => (string) $row[0], 'item' => (string) $row[1], 'value_text' => $row[2] ?: null, 'reporting_period' => $row[3] ?: null, 'data_source' => $row[4] ?: 'clinical-workbook'];
            if (!$dryRun) AnnualReportEntry::updateOrCreate(['category' => $data['category'], 'item' => $data['item'], 'reporting_period' => $data['reporting_period']], $data);
        }
        $this->info(($dryRun ? 'Validated' : 'Imported')." {$years} academic years, {$departments} departments, {$sites} sites, {$students} students, {$people} staff, {$courses} courses, {$rotations} rotations, {$blocks} blocks, {$sessions} clinical sessions, {$attendance} attendance records, {$grades} grade entries, {$surveys} surveys, {$questions} questions, {$plans} plans, {$kpis} KPIs, {$correspondence} correspondence, {$meetings} meetings and {$actions} action items.");
        return self::SUCCESS;
    }
}
