<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller; use App\Http\Controllers\Concerns\HasSafePagination; use App\Http\Responses\ApiResponse; use App\Models\Student; use App\Models\QualitySurvey; use App\Models\QualitySurveyQuestion; use App\Models\QualitySurveyResponse; use App\Models\QualitySurveySubmission; use Illuminate\Database\QueryException; use Illuminate\Http\JsonResponse; use Illuminate\Http\Request; use Illuminate\Support\Facades\DB; use Illuminate\Support\Str; use Illuminate\Validation\Rule;
class QualitySurveyController extends Controller {
 use HasSafePagination;
 public function index(Request $request): JsonResponse { $items=QualitySurvey::withCount(['questions','responses','submissions'])->when($request->filled('academic_year'),fn($q)=>$q->where('academic_year',$request->string('academic_year')))->when($request->filled('status'),fn($q)=>$q->where('status',$request->string('status')))->when($request->filled('search'),fn($q)=>$q->where(fn($inner)=>$inner->where('title','like','%'.$request->string('search').'%')->orWhere('code','like','%'.$request->string('search').'%')->orWhere('target_group','like','%'.$request->string('search').'%')))->orderByDesc('created_at')->paginate($this->perPage($request,25,100)); return ApiResponse::success($items->items(),null,['current_page'=>$items->currentPage(),'last_page'=>$items->lastPage(),'total'=>$items->total()]); }
 public function participationOptions(): JsonResponse { return ApiResponse::success(QualitySurvey::whereNotNull('target_levels')->orderByDesc('created_at')->get(['id','title','target_levels','status'])); }
 public function store(Request $request): JsonResponse { $data=$this->validatedSurvey($request); if (!empty($data['target_levels'])) { $data['response_policy']='one_per_identifier'; $data['is_anonymous']=true; } $data['public_id']=(string)Str::uuid(); $data['code']=filled($data['code']??null)?$data['code']:'SUR-'.str_pad((string)((QualitySurvey::max('id')??0)+1),4,'0',STR_PAD_LEFT); return ApiResponse::success(QualitySurvey::create($data),'Quality survey created.',[],201); }
 public function update(Request $request, QualitySurvey $qualitySurvey): JsonResponse { $data=$this->validatedSurvey($request,$qualitySurvey); if($qualitySurvey->status!=='draft' && array_key_exists('target_levels',$data) && $data['target_levels']!==$qualitySurvey->target_levels) return ApiResponse::error('لا يمكن تغيير الدفعات بعد نشر الاستبيان.',[],[],409); if(!empty($qualitySurvey->target_levels) && $qualitySurvey->status!=='draft' && isset($data['target_group']) && $data['target_group']!==$qualitySurvey->target_group) return ApiResponse::error('لا يمكن تغيير الفئة بعد نشر الاستبيان.',[],[],409); if($qualitySurvey->submissions()->exists() && array_key_exists('target_levels',$data) && $data['target_levels']!==$qualitySurvey->target_levels) return ApiResponse::error('لا يمكن تغيير الدفعات بعد وصول الردود.',[],[],409); if (!empty($qualitySurvey->target_levels) || !empty($data['target_levels'])) { $data['response_policy']='one_per_identifier'; $data['is_anonymous']=true; } $qualitySurvey->update($data); return ApiResponse::success($qualitySurvey->fresh()->loadCount(['questions','responses']),'تم تحديث الاستبيان.'); }
 public function transition(Request $request, QualitySurvey $qualitySurvey): JsonResponse
 {
  $data=$request->validate(['status'=>['required',Rule::in(['draft','open','closed','archived'])]]);
  if($data['status']==='open' && $qualitySurvey->questions()->count()===0) return ApiResponse::error('لا يمكن نشر استبيان بلا أسئلة.',[],[],422);
  if($data['status']==='open' && !empty($qualitySurvey->target_levels)) {
   if($qualitySurvey->target_group!=='الطلبة') return ApiResponse::error('تحديد الدفعات متاح لاستبيان الطلبة فقط.',[],[],422);
   $studentQuery=Student::whereIn('academic_level',$qualitySurvey->target_levels)->where('registration_status','active');
   if(!DB::table('quality_survey_audience_students')->where('quality_survey_id',$qualitySurvey->id)->exists() && !$studentQuery->exists()) return ApiResponse::error('لا يوجد طلبة نشطون في الدفعات المختارة.',[],[],422);
   DB::transaction(function()use($studentQuery,$qualitySurvey,$data){
    $locked=QualitySurvey::whereKey($qualitySurvey->id)->lockForUpdate()->firstOrFail();
    if(!DB::table('quality_survey_audience_students')->where('quality_survey_id',$qualitySurvey->id)->exists()) {
     $studentQuery->select(['id','academic_level'])->chunkById(500,function($students)use($qualitySurvey){DB::table('quality_survey_audience_students')->insert($students->map(fn($student)=>['quality_survey_id'=>$qualitySurvey->id,'student_id'=>$student->id,'academic_level'=>$student->academic_level])->all());});
    }
    $locked->update(['status'=>$data['status'],'is_active'=>true]);
   });
  } else {
   $qualitySurvey->update(['status'=>$data['status'],'is_active'=>!in_array($data['status'],['closed','archived'],true)]);
  }
  return ApiResponse::success($qualitySurvey->fresh(),'تم تحديث حالة الاستبيان.');
 }
 public function show(QualitySurvey $qualitySurvey): JsonResponse { return ApiResponse::success($qualitySurvey->load(['questions'=>fn($q)=>$q->orderBy('version')->orderBy('question_number')])->loadCount('submissions')); }
 public function participation(Request $request, QualitySurvey $qualitySurvey): JsonResponse
 {
  abort_if(empty($qualitySurvey->target_levels),404);
  $base=DB::table('quality_survey_audience_students as audience')
   ->join('students as student','student.id','=','audience.student_id')
   ->leftJoin('quality_survey_participations as participation',function($join)use($qualitySurvey){$join->on('participation.student_id','=','audience.student_id')->where('participation.quality_survey_id','=',$qualitySurvey->id);})
   ->where('audience.quality_survey_id',$qualitySurvey->id);
  $summary=[];
  foreach($qualitySurvey->target_levels as $level){$levelQuery=(clone $base)->where('audience.academic_level',$level);$summary[$level]=['total'=>(clone $levelQuery)->count(),'completed'=>(clone $levelQuery)->whereNotNull('participation.id')->count()];}
  $rows=(clone $base)
   ->when($request->filled('academic_level'),fn($query)=>$query->where('audience.academic_level',$request->string('academic_level')))
   ->when($request->filled('status'),fn($query)=>$request->string('status')->toString()==='completed'?$query->whereNotNull('participation.id'):$query->whereNull('participation.id'))
   ->when($request->filled('search'),fn($query)=>$query->where(fn($inner)=>$inner->where('student.full_name_ar','like','%'.$request->string('search').'%')->orWhere('student.university_number','like','%'.$request->string('search').'%')))
   ->orderBy('audience.academic_level')->orderBy('student.full_name_ar')
   ->select(['student.id','student.full_name_ar','student.full_name_en','student.university_number','student.photo_url','audience.academic_level','participation.completed_on'])
   ->paginate($this->perPage($request,25,100));
  return ApiResponse::success(['summary'=>$summary,'students'=>$rows->items()],null,['current_page'=>$rows->currentPage(),'last_page'=>$rows->lastPage(),'total'=>$rows->total()]);
 }
 public function responses(Request $request, QualitySurvey $qualitySurvey): JsonResponse { $responses=QualitySurveyResponse::with('question:id,question_text')->where('quality_survey_id',$qualitySurvey->id)->latest('responded_at')->paginate($this->perPage($request,50,100)); $summary=QualitySurveyResponse::query()->leftJoin('quality_survey_questions','quality_survey_questions.id','=','quality_survey_responses.quality_survey_question_id')->where('quality_survey_responses.quality_survey_id',$qualitySurvey->id)->groupBy('quality_survey_responses.quality_survey_question_id','quality_survey_questions.question_text')->get(['quality_survey_responses.quality_survey_question_id as question_id','quality_survey_questions.question_text',DB::raw('COUNT(*) as response_count'),DB::raw('AVG(quality_survey_responses.numeric_answer) as numeric_average')]); $submissionCount=QualitySurveyResponse::where('quality_survey_id',$qualitySurvey->id)->whereNotNull('submission_id')->distinct()->count('submission_id'); return ApiResponse::success(['responses'=>$responses->items(),'summary'=>$summary,'submission_count'=>$submissionCount],null,['current_page'=>$responses->currentPage(),'last_page'=>$responses->lastPage(),'total'=>$responses->total()]); }
 public function storeQuestion(Request $request, QualitySurvey $qualitySurvey): JsonResponse { $data=$request->validate(['version'=>['nullable','string','max:50'],'question_number'=>['nullable','integer','min:1'],'question_text'=>['required','string','max:3000'],'question_type'=>['required',Rule::in(['rating','single_choice','multiple_choice','short_text','long_text','number'])],'options'=>['nullable','string','max:3000'],'is_required'=>['boolean'],'weight'=>['nullable','numeric','min:0'],'axis'=>['nullable','string','max:255'],'active_from'=>['nullable','date'],'active_until'=>['nullable','date']]); if($qualitySurvey->submissions()->exists()) return ApiResponse::error('لا يمكن تعديل أسئلة استبيان بعد استلام ردود. أنشئ استبيانًا جديدًا للتغييرات.',[],[],409); $data['version']??='1'; $data['question_number']??=((int)$qualitySurvey->questions()->where('version',$data['version'])->max('question_number'))+1; $data['quality_survey_id']=$qualitySurvey->id; return ApiResponse::success(QualitySurveyQuestion::create($data),'Survey question created.',[],201); }
 public function updateQuestion(Request $request, QualitySurvey $qualitySurvey, QualitySurveyQuestion $question): JsonResponse { abort_unless($question->quality_survey_id===$qualitySurvey->id,404); $data=$request->validate(['question_text'=>['required','string','max:3000'],'question_type'=>['required',Rule::in(['rating','single_choice','multiple_choice','short_text','long_text','number'])],'options'=>['nullable','string','max:3000'],'is_required'=>['boolean'],'axis'=>['nullable','string','max:255']]); if ($qualitySurvey->submissions()->exists()) return ApiResponse::error('لا يمكن تعديل أسئلة استبيان استلم ردودًا.',[],[],409); $question->update($data); return ApiResponse::success($question->fresh(),'تم تحديث السؤال.'); }
 public function destroyQuestion(QualitySurvey $qualitySurvey, QualitySurveyQuestion $question): JsonResponse { abort_unless($question->quality_survey_id===$qualitySurvey->id,404); if($qualitySurvey->submissions()->exists()) return ApiResponse::error('لا يمكن حذف أسئلة استبيان استلم ردودًا.',[],[],409); $question->delete(); return ApiResponse::success(null,'تم حذف السؤال.'); }
 public function responseMatrix(QualitySurvey $qualitySurvey): JsonResponse { $questions=$qualitySurvey->questions()->orderBy('question_number')->get(['id','question_number','question_text','question_type','options']); $answers=QualitySurveyResponse::where('quality_survey_id',$qualitySurvey->id)->whereNotNull('submission_id')->orderByDesc('responded_at')->get(); $submissions=$answers->groupBy('submission_id')->map(function($rows,$submissionId){$first=$rows->first();return ['submission_id'=>$submissionId,'responded_at'=>$first->responded_at,'respondent_identifier'=>$first->respondent_identifier,'answers'=>$rows->mapWithKeys(fn($row)=>[$row->quality_survey_question_id=>$row->numeric_answer??$row->text_answer])->all()];})->values(); return ApiResponse::success(['survey'=>$qualitySurvey->only(['id','code','title','status','is_anonymous']),'questions'=>$questions,'submissions'=>$submissions]); }
 public function storeResponse(Request $request, QualitySurvey $qualitySurvey): JsonResponse { $data=$request->validate(['quality_survey_question_id'=>['required','exists:quality_survey_questions,id'],'version'=>['required','string','max:50'],'respondent_identifier'=>['nullable','string','max:255'],'target_group'=>['nullable','string','max:255'],'course_id'=>['nullable','exists:courses,id'],'department_id'=>['nullable','exists:departments,id'],'training_site_id'=>['nullable','exists:training_sites,id'],'supervisor_person_id'=>['nullable','exists:people,id'],'numeric_answer'=>['nullable','numeric'],'text_answer'=>['nullable','string','max:5000']]); if(!QualitySurveyQuestion::where('id',$data['quality_survey_question_id'])->where('quality_survey_id',$qualitySurvey->id)->exists()) return ApiResponse::error('The question does not belong to this survey.',[],[],422); $data['quality_survey_id']=$qualitySurvey->id; $data['responded_at']=now(); return ApiResponse::success(QualitySurveyResponse::create($data),'Survey response recorded.',[],201); }
 public function publicShow(QualitySurvey $qualitySurvey): JsonResponse { if($qualitySurvey->status!=='open'||!$qualitySurvey->is_active) return ApiResponse::error('هذا الاستبيان غير متاح حاليًا.',[],[],404); if(($qualitySurvey->opens_at&&$qualitySurvey->opens_at->isFuture())||($qualitySurvey->closes_at&&$qualitySurvey->closes_at->endOfDay()->isPast())) return ApiResponse::error('هذا الاستبيان خارج فترة الاستجابة.',[],[],409); return ApiResponse::success($qualitySurvey->only(['public_id','title','target_group','purpose','is_anonymous','response_policy','is_mandatory','closes_at'])+['requires_student_number'=>!empty($qualitySurvey->target_levels),'questions'=>$qualitySurvey->questions()->orderBy('question_number')->get(['id','question_number','question_text','question_type','options','is_required','axis'])]); }
 public function publicEligibility(Request $request, QualitySurvey $qualitySurvey): JsonResponse
 {
  if($qualitySurvey->status!=='open'||!$qualitySurvey->is_active) return ApiResponse::error('هذا الاستبيان غير متاح حاليًا.',[],[],404);
  if(($qualitySurvey->opens_at&&$qualitySurvey->opens_at->isFuture())||($qualitySurvey->closes_at&&$qualitySurvey->closes_at->endOfDay()->isPast())) return ApiResponse::error('هذا الاستبيان خارج فترة الاستجابة.',[],[],409);
  $data=$request->validate(['respondent_identifier'=>['nullable','string','max:255'],'respondent_token'=>['nullable','uuid']]);
  if(!empty($qualitySurvey->target_levels)) {
   $number=$this->normalizeStudentNumber($data['respondent_identifier']??null);
   if($number==='') return ApiResponse::error('أدخل رقمك الجامعي أولًا.',[],[],422);
   $student=Student::where('university_number',$number)->first();
   if(!$student||!DB::table('quality_survey_audience_students')->where('quality_survey_id',$qualitySurvey->id)->where('student_id',$student->id)->exists()) return ApiResponse::error('الرقم الجامعي غير موجود ضمن الطلبة المستهدفين بهذا الاستبيان.',[],[],422);
   $exists=DB::table('quality_survey_participations')->where('quality_survey_id',$qualitySurvey->id)->where('student_id',$student->id)->exists();
   return ApiResponse::success(['eligible'=>!$exists,'message'=>$exists?'تم تسجيل مشاركة لهذا الرقم الجامعي مسبقًا.':null]);
  }
  if($qualitySurvey->response_policy==='multiple') return ApiResponse::success(['eligible'=>true]);
  if($qualitySurvey->response_policy==='one_per_identifier'&&blank($data['respondent_identifier']??null)) return ApiResponse::error('أدخل الرقم أو المعرّف أولًا.',[],[],422);
  if($qualitySurvey->response_policy==='one_per_device'&&blank($data['respondent_token']??null)) return ApiResponse::error('تعذر التحقق من الجهاز.',[],[],422);
  $key=$qualitySurvey->response_policy==='one_per_identifier'?hash('sha256',mb_strtolower(trim($data['respondent_identifier']))):hash('sha256',$data['respondent_token']);
  $exists=QualitySurveySubmission::where('quality_survey_id',$qualitySurvey->id)->where('respondent_key',$key)->exists();
  return ApiResponse::success(['eligible'=>!$exists,'message'=>$exists?'تم إرسال رد لهذا الاستبيان مسبقًا.':null]);
 }
 public function publicSubmit(Request $request, QualitySurvey $qualitySurvey): JsonResponse
 {
  if ($qualitySurvey->status !== 'open' || ! $qualitySurvey->is_active) return ApiResponse::error('هذا الاستبيان غير متاح حاليًا.', [], [], 409);
  if (($qualitySurvey->opens_at && $qualitySurvey->opens_at->isFuture()) || ($qualitySurvey->closes_at && $qualitySurvey->closes_at->endOfDay()->isPast())) return ApiResponse::error('هذا الاستبيان خارج فترة الاستجابة.', [], [], 409);
  $data = $request->validate([
   'respondent_identifier' => ['nullable', 'string', 'max:255'], 'respondent_token' => ['nullable', 'uuid'],
   'answers' => ['required', 'array', 'min:1'], 'answers.*.question_id' => ['required', 'integer'], 'answers.*.value' => ['nullable'],
  ]);
  $trackedStudent = null;
  if (!empty($qualitySurvey->target_levels)) {
   $number = $this->normalizeStudentNumber($data['respondent_identifier'] ?? null);
   if ($number === '') return ApiResponse::error('أدخل رقمك الجامعي أولًا.', [], [], 422);
   $trackedStudent = Student::where('university_number',$number)->first();
   if (!$trackedStudent || !DB::table('quality_survey_audience_students')->where('quality_survey_id',$qualitySurvey->id)->where('student_id',$trackedStudent->id)->exists()) return ApiResponse::error('الرقم الجامعي غير موجود ضمن الطلبة المستهدفين بهذا الاستبيان.', [], [], 422);
   if (DB::table('quality_survey_participations')->where('quality_survey_id',$qualitySurvey->id)->where('student_id',$trackedStudent->id)->exists()) return ApiResponse::error('تم تسجيل مشاركة لهذا الرقم الجامعي مسبقًا.', [], [], 409);
   $data['respondent_identifier']=$number;
  }
  if (!$trackedStudent && $qualitySurvey->response_policy === 'one_per_identifier' && blank($data['respondent_identifier'] ?? null)) return ApiResponse::error('الرقم أو المعرّف مطلوب لضمان رد واحد لكل شخص.', [], [], 422);
  if (!$trackedStudent && $qualitySurvey->response_policy === 'one_per_device' && blank($data['respondent_token'] ?? null)) return ApiResponse::error('تعذر التحقق من الجهاز. حدّث الصفحة وحاول مجددًا.', [], [], 422);
  $key = $trackedStudent ? null : match ($qualitySurvey->response_policy) {
   'one_per_identifier' => hash('sha256', mb_strtolower(trim($data['respondent_identifier']))),
   'one_per_device' => hash('sha256', $data['respondent_token']), default => null,
  };
  $questions = $qualitySurvey->questions()->get()->keyBy('id');
  $answers = collect($data['answers']);
  if ($answers->pluck('question_id')->unique()->count() !== $answers->count()) return ApiResponse::error('لا يمكن إرسال أكثر من إجابة للسؤال نفسه.', [], [], 422);
  foreach ($questions->where('is_required', true) as $question) {
   $answer = $answers->firstWhere('question_id', $question->id);
   if (! $answer || blank($answer['value'] ?? null)) return ApiResponse::error('يرجى الإجابة عن جميع الأسئلة المطلوبة.', ['question_'.$question->id => ['هذا السؤال مطلوب.']], [], 422);
  }
  foreach ($answers as $answer) {
   $question = $questions->get((int) $answer['question_id']);
   if (! $question) return ApiResponse::error('السؤال غير موجود في هذا الاستبيان.', [], [], 422);
   $value = $answer['value'] ?? null;
   if (blank($value)) continue;
   if (! is_scalar($value) || mb_strlen((string) $value) > 5000) return ApiResponse::error('صيغة الإجابة غير صالحة.', [], [], 422);
   if ($question->question_type === 'rating' && (! ctype_digit((string) $value) || (int) $value < 1 || (int) $value > 5)) return ApiResponse::error('التقييم يجب أن يكون من 1 إلى 5.', [], [], 422);
   if ($question->question_type === 'number' && ! is_numeric($value)) return ApiResponse::error('أدخل قيمة رقمية صحيحة.', [], [], 422);
   if (in_array($question->question_type, ['single_choice', 'multiple_choice'], true)) {
    $choices = collect(preg_split('/[,\n]/u', (string) $question->options))->map(fn ($choice) => trim($choice))->filter()->values()->all();
    $selected = $question->question_type === 'multiple_choice' ? preg_split('/\n/u', (string) $value) : [(string) $value];
    if (! count($selected) || count($selected) !== count(array_unique($selected)) || collect($selected)->contains(fn ($choice) => ! in_array(trim($choice), $choices, true))) return ApiResponse::error('الإجابة لا تطابق خيارات السؤال.', [], [], 422);
   }
  }
  $submission = (string) Str::uuid();
  try {
   DB::transaction(function () use ($data, $questions, $qualitySurvey, $submission, $key, $trackedStudent) {
    if ($trackedStudent) DB::table('quality_survey_participations')->insert(['quality_survey_id'=>$qualitySurvey->id,'student_id'=>$trackedStudent->id,'completed_on'=>today()->toDateString()]);
    QualitySurveySubmission::create(['id' => $submission, 'quality_survey_id' => $qualitySurvey->id, 'respondent_key' => $key, 'respondent_identifier' => $qualitySurvey->is_anonymous ? null : ($data['respondent_identifier'] ?? null), 'submitted_at' => now()]);
    foreach ($data['answers'] as $answer) {
     $question = $questions->get((int) $answer['question_id']);
     $numeric = in_array($question->question_type, ['rating', 'number'], true) && is_numeric($answer['value'] ?? null);
     QualitySurveyResponse::create(['submission_id' => $submission, 'quality_survey_id' => $qualitySurvey->id, 'quality_survey_question_id' => $question->id, 'version' => $question->version, 'responded_at' => now(), 'respondent_identifier' => $qualitySurvey->is_anonymous ? null : ($data['respondent_identifier'] ?? null), 'target_group' => $qualitySurvey->target_group, 'numeric_answer' => $numeric ? (float) $answer['value'] : null, 'text_answer' => $numeric ? null : ($answer['value'] ?? null)]);
    }
   });
  } catch (QueryException $exception) {
   if ($trackedStudent && DB::table('quality_survey_participations')->where('quality_survey_id',$qualitySurvey->id)->where('student_id',$trackedStudent->id)->exists()) return ApiResponse::error('تم تسجيل مشاركة لهذا الرقم الجامعي مسبقًا.', [], [], 409);
   if ($key !== null && QualitySurveySubmission::where('quality_survey_id',$qualitySurvey->id)->where('respondent_key',$key)->exists()) return ApiResponse::error('تم إرسال رد لهذا الاستبيان مسبقًا، ولا يسمح هذا النموذج بأكثر من رد.', [], [], 409);
   throw $exception;
  }
  return ApiResponse::success(['submission_id' => $submission], 'شكرًا، تم استلام إجابتك.', [], 201);
 }
 private function validatedSurvey(Request $request, ?QualitySurvey $survey=null): array { return $request->validate(['code'=>['nullable','string','max:100',Rule::unique('quality_surveys','code')->ignore($survey?->id)],'title'=>['required','string','max:500'],'target_group'=>['required','string','max:255'],'target_levels'=>['sometimes','array','min:1'],'target_levels.*'=>['required','distinct',Rule::in(['fourth','fifth','sixth'])],'academic_year'=>['nullable','string','max:100'],'purpose'=>['nullable','string','max:3000'],'frequency'=>['nullable','string','max:100'],'opens_at'=>['nullable','date'],'closes_at'=>['nullable','date','after_or_equal:opens_at'],'expected_responses'=>['nullable','integer','min:1'],'responsible'=>['nullable','string','max:255'],'form_url'=>['nullable','url','max:2000'],'is_mandatory'=>['boolean'],'is_anonymous'=>['boolean'],'response_policy'=>['sometimes',Rule::in(['multiple','one_per_device','one_per_identifier'])],'notes'=>['nullable','string','max:3000'],'status'=>['sometimes',Rule::in(['draft','open','closed','archived'])]]); }
 private function normalizeStudentNumber(?string $value): string { return strtr(trim((string)$value), ['٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4','٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9','۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9']); }
}
