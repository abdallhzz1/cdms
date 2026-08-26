<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\AuditLog;
use App\Models\GroupRegistrationCycle;
use App\Models\GroupRegistrationOtpChallenge;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentGroupRoster;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class GroupSelfRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private AcademicYear $year;
    private GroupRegistrationCycle $cycle;
    private StudentGroup $group;
    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->year = AcademicYear::factory()->create();
        $this->cycle = GroupRegistrationCycle::create([
            'academic_year_id'=>$this->year->id,'academic_level'=>'fourth','public_id'=>(string)Str::uuid(),
            'status'=>'open','default_capacity'=>6,
        ]);
        $this->group = StudentGroup::create(['academic_year_id'=>$this->year->id,'academic_level'=>'fourth','name'=>'L','group_type'=>'self_registration']);
        $this->group->subgroups()->create(['name'=>'L1','capacity'=>6,'max_size'=>6,'is_active'=>true]);
        $this->group->subgroups()->create(['name'=>'L2','capacity'=>6,'max_size'=>6,'is_active'=>true]);
        $this->student = Student::factory()->create(['university_number'=>'22210466','academic_level'=>'fourth','academic_year_id'=>$this->year->id,'academic_registration_status'=>'registered']);
        StudentGroupRoster::create(['group_registration_cycle_id'=>$this->cycle->id,'student_id'=>$this->student->id,'student_group_id'=>$this->group->id]);
    }

    public function test_registered_student_receives_otp_challenge_without_groups_being_disclosed(): void
    {
        Mail::fake();
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/request-otp", ['university_number'=>'22210466'])
            ->assertOk()->assertJsonStructure(['data'=>['challenge_token','email_hint','expires_in_seconds']])
            ->assertJsonMissing(['subgroups']);
        $this->assertDatabaseCount('group_registration_otp_challenges',1);
    }

    public function test_unregistered_student_cannot_receive_otp_or_see_groups(): void
    {
        Mail::fake();
        $this->student->update(['academic_registration_status'=>'unregistered']);
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/request-otp", ['university_number'=>'22210466'])
            ->assertForbidden()->assertJsonPath('errors.code.0','registration_required')->assertJsonMissing(['subgroups']);
        $this->assertDatabaseCount('group_registration_otp_challenges',0);
    }

    public function test_otp_verification_counts_failed_attempts_and_issues_hashed_session_token(): void
    {
        $challengeToken=Str::random(64);
        $challenge=GroupRegistrationOtpChallenge::create(['group_registration_cycle_id'=>$this->cycle->id,'student_id'=>$this->student->id,'challenge_token_hash'=>hash('sha256',$challengeToken),'otp_hash'=>Hash::make('123456'),'expires_at'=>now()->addMinutes(10)]);
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/verify-otp",['challenge_token'=>$challengeToken,'otp'=>'000000'])->assertUnprocessable();
        $this->assertSame(1,$challenge->fresh()->attempts);
        $response=$this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/verify-otp",['challenge_token'=>$challengeToken,'otp'=>'123456'])->assertOk();
        $plain=$response->json('data.access_token');
        $this->assertNotSame($plain,$challenge->fresh()->access_token_hash);
        $this->assertSame(hash('sha256',$plain),$challenge->fresh()->access_token_hash);
    }

    public function test_mail_failure_fails_closed_and_removes_challenge(): void
    {
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('smtp unavailable'));
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/request-otp", ['university_number'=>'22210466'])
            ->assertStatus(503)->assertJsonPath('errors.code.0','otp_delivery_failed')->assertJsonMissing(['subgroups']);
        $this->assertDatabaseCount('group_registration_otp_challenges',0);
    }

    public function test_verified_student_only_sees_own_main_group_and_can_select_then_withdraw(): void
    {
        $token = Str::random(80);
        GroupRegistrationOtpChallenge::create([
            'group_registration_cycle_id'=>$this->cycle->id,'student_id'=>$this->student->id,
            'challenge_token_hash'=>hash('sha256',Str::random(64)),'otp_hash'=>Hash::make('123456'),
            'expires_at'=>now()->addMinutes(10),'verified_at'=>now(),'consumed_at'=>now(),
            'access_token_hash'=>hash('sha256',$token),'access_expires_at'=>now()->addMinutes(20),
        ]);
        $other=StudentGroup::create(['academic_year_id'=>$this->year->id,'academic_level'=>'fourth','name'=>'M','group_type'=>'self_registration']);
        $otherSub=$other->subgroups()->create(['name'=>'M1','capacity'=>6,'max_size'=>6,'is_active'=>true]);
        $unrelatedAssignment=StudentGroupAssignment::create([
            'student_id'=>$this->student->id,'academic_year_id'=>$this->year->id,
            'student_group_id'=>$other->id,'student_subgroup_id'=>$otherSub->id,
            'valid_from'=>now()->toDateString(),'change_reason'=>'unrelated_group_test',
        ]);

        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/options",['access_token'=>$token])
            ->assertOk()->assertJsonPath('data.main_group','L')->assertJsonCount(2,'data.subgroups')->assertJsonMissing(['M1']);
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/select",['access_token'=>$token,'subgroup_id'=>$otherSub->id])->assertUnprocessable();
        $target=$this->group->subgroups()->first();
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/select",['access_token'=>$token,'subgroup_id'=>$target->id])->assertOk();
        $this->assertDatabaseHas('student_group_assignments',['student_id'=>$this->student->id,'student_subgroup_id'=>$target->id,'valid_until'=>null]);
        StudentGroupAssignment::where('student_id',$this->student->id)->where('student_subgroup_id',$target->id)
            ->update(['student_group_id'=>$other->id]); // Simulate a legacy inconsistent main-group field.
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/options",['access_token'=>$token])
            ->assertOk()->assertJsonPath('data.subgroups.0.is_selected', true);
        $replacement=$this->group->subgroups()->where('id','!=',$target->id)->firstOrFail();
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/select",['access_token'=>$token,'subgroup_id'=>$replacement->id])
            ->assertUnprocessable()->assertJsonPath('errors.subgroup_id.0', 'يجب سحب تسجيلك من مجموعتك الحالية أولاً قبل اختيار مجموعة أخرى.');
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/withdraw",['access_token'=>$token])->assertOk();
        $this->assertNotNull(StudentGroupAssignment::where('student_id',$this->student->id)->where('student_subgroup_id',$target->id)->firstOrFail()->valid_until);
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/select",['access_token'=>$token,'subgroup_id'=>$replacement->id])->assertOk();
        $this->assertDatabaseHas('student_group_assignments',['student_id'=>$this->student->id,'student_subgroup_id'=>$replacement->id,'valid_until'=>null]);
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/withdraw",['access_token'=>$token])->assertOk();
        $this->assertSame(0,StudentGroupAssignment::where('student_id',$this->student->id)->where('student_group_id',$this->group->id)->whereNull('valid_until')->count());
        $this->assertNull($unrelatedAssignment->fresh()->valid_until);
    }

    public function test_full_subgroup_rejects_another_student(): void
    {
        $target=$this->group->subgroups()->first();
        $target->update(['capacity'=>1,'max_size'=>1]);
        $existing=Student::factory()->create(['academic_year_id'=>$this->year->id]);
        StudentGroupAssignment::create(['student_id'=>$existing->id,'academic_year_id'=>$this->year->id,'student_group_id'=>$this->group->id,'student_subgroup_id'=>$target->id,'valid_from'=>now()->toDateString(),'change_reason'=>'test']);
        $token=Str::random(80);
        GroupRegistrationOtpChallenge::create(['group_registration_cycle_id'=>$this->cycle->id,'student_id'=>$this->student->id,'challenge_token_hash'=>hash('sha256',Str::random(64)),'otp_hash'=>Hash::make('123456'),'expires_at'=>now()->addMinutes(10),'verified_at'=>now(),'consumed_at'=>now(),'access_token_hash'=>hash('sha256',$token),'access_expires_at'=>now()->addMinutes(20)]);
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/select",['access_token'=>$token,'subgroup_id'=>$target->id])->assertUnprocessable();
        $this->assertSame(1,StudentGroupAssignment::where('student_subgroup_id',$target->id)->whereNull('valid_until')->count());
    }

    public function test_manual_student_creation_can_link_the_registration_cycle_and_main_group(): void
    {
        $permission=Permission::firstOrCreate(['code'=>'students.create'],['module'=>'Students','action'=>'CREATE','description_key'=>'permissions.students_create.description']);
        $role=Role::create(['code'=>'TEST_STUDENT_CREATOR','name_key'=>'test.student.creator']);
        $role->permissions()->attach($permission->id,['scope_type'=>'global']);
        $user=User::factory()->create();
        $user->roles()->attach($role);

        $this->actingAs($user)->postJson('/api/v1/students',[
            'university_number'=>'22440001',
            'full_name_ar'=>'طالب مضاف يدوياً',
            'academic_level'=>'fourth',
            'registration_status'=>'active',
            'academic_registration_status'=>'registered',
            'university_email'=>'22440001@students.hebron.edu',
            'group_registration_cycle_id'=>$this->cycle->id,
            'main_group_code'=>'L',
        ])->assertCreated();

        $created=Student::where('university_number','22440001')->firstOrFail();
        $this->assertSame($this->year->id,$created->academic_year_id);
        $this->assertDatabaseHas('student_group_rosters',[
            'group_registration_cycle_id'=>$this->cycle->id,
            'student_id'=>$created->id,
            'student_group_id'=>$this->group->id,
        ]);
    }

    public function test_a_fixed_subgroup_count_balances_each_main_group_and_is_idempotent(): void
    {
        $permission=Permission::where('code','group_registration.manage_groups')->firstOrFail();
        $role=Role::create(['code'=>'TEST_SMART_GROUP_PLANNER','name_key'=>'test.smart.group.planner']);
        $role->permissions()->attach($permission->id,['scope_type'=>'global']);
        $user=User::factory()->create();
        $user->roles()->attach($role);

        // L has 11 students and M has 13; both must still receive the exact
        // administrator-selected number of subgroups with balanced capacities.
        foreach (range(1, 10) as $index) {
            $student=Student::factory()->create(['academic_level'=>'fourth','academic_year_id'=>$this->year->id]);
            StudentGroupRoster::create(['group_registration_cycle_id'=>$this->cycle->id,'student_id'=>$student->id,'student_group_id'=>$this->group->id]);
        }

        $groupM=StudentGroup::create(['academic_year_id'=>$this->year->id,'academic_level'=>'fourth','name'=>'M','group_type'=>'self_registration']);
        foreach (range(1, 13) as $index) {
            $student=Student::factory()->create(['academic_level'=>'fourth','academic_year_id'=>$this->year->id]);
            StudentGroupRoster::create(['group_registration_cycle_id'=>$this->cycle->id,'student_id'=>$student->id,'student_group_id'=>$groupM->id]);
        }

        $url="/api/v1/group-registration-cycles/{$this->cycle->id}/generate-subgroups";
        $payload=['strategy'=>'fixed_count','subgroups_per_main_group'=>8];
        $this->actingAs($user)->postJson($url,$payload)
            ->assertOk()
            ->assertJsonPath('data.groups.0.roster_count',11)
            ->assertJsonPath('data.groups.1.roster_count',13);

        $this->assertSame([2,2,2,1,1,1,1,1],$this->group->subgroups()->orderBy('name')->pluck('capacity')->map(fn($capacity)=>(int)$capacity)->all());
        $this->assertSame([2,2,2,2,2,1,1,1],$groupM->subgroups()->orderBy('name')->pluck('capacity')->map(fn($capacity)=>(int)$capacity)->all());

        // Re-running the planner must not duplicate already-created groups.
        $this->actingAs($user)->postJson($url,$payload)->assertOk();
        $this->assertSame(8,$this->group->subgroups()->count());
        $this->assertSame(8,$groupM->subgroups()->count());
    }

    public function test_administrator_sees_registered_student_names_inside_each_subgroup(): void
    {
        $subgroup=$this->group->subgroups()->firstOrFail();
        StudentGroupAssignment::create([
            'student_id'=>$this->student->id,
            'academic_year_id'=>$this->year->id,
            'student_group_id'=>$this->group->id,
            'student_subgroup_id'=>$subgroup->id,
            'valid_from'=>now()->toDateString(),
            'change_reason'=>'test',
        ]);
        $permission=Permission::where('code','group_registration.view')->firstOrFail();
        $role=Role::create(['code'=>'TEST_GROUP_VIEWER','name_key'=>'test.group.viewer']);
        $role->permissions()->attach($permission->id,['scope_type'=>'global']);
        $user=User::factory()->create();
        $user->roles()->attach($role);

        $this->actingAs($user)->getJson('/api/v1/group-registration-cycles')
            ->assertOk()
            ->assertJsonPath('data.0.groups.0.subgroups.0.registered_students.0.name',$this->student->full_name_ar)
            ->assertJsonPath('data.0.groups.0.subgroups.0.registered_students.0.university_number','22210466');
    }

    public function test_authorized_administrator_can_create_cycle_import_roster_and_open_it(): void
    {
        $role=Role::create(['code'=>'TEST_GROUP_ADMIN','name_key'=>'test.group.admin']);
        Permission::firstOrCreate(['code'=>'students.create'],['module'=>'Students','action'=>'CREATE','description_key'=>'permissions.students_create.description']);
        $role->permissions()->sync(Permission::where('code','like','group_registration.%')->orWhere('code','students.create')->pluck('id')->mapWithKeys(fn($id)=>[$id=>['scope_type'=>'global']])->all());
        $user=User::factory()->create();
        $user->roles()->attach($role);
        $secondYear=AcademicYear::factory()->create();

        $this->actingAs($user)->postJson('/api/v1/group-registration-cycles',[
            'academic_year_id'=>$secondYear->id,'academic_level'=>'fifth','default_capacity'=>6,
        ])->assertCreated()->assertJsonPath('data.groups.0.name','A')->assertJsonCount(3,'data.groups');
        $created=GroupRegistrationCycle::where('academic_year_id',$secondYear->id)->firstOrFail();
        $this->actingAs($user)->postJson('/api/v1/students/bulk-import',[
            'group_registration_cycle_id'=>$created->id,
            'students'=>[
                ['university_number'=>'22550001','full_name_ar'=>'طالب تجريبي','academic_level'=>'fifth','main_group_code'=>'A','academic_registration_status'=>'registered'],
            ],
        ])->assertOk()->assertJsonPath('data.rostered',1);
        $this->assertDatabaseHas('students',['university_number'=>'22550001','university_email'=>'22550001@students.hebron.edu','academic_registration_status'=>'registered']);
        $this->assertDatabaseHas('student_group_rosters',['group_registration_cycle_id'=>$created->id,'student_group_id'=>$created->fresh()->rosters()->first()->student_group_id]);
        $this->actingAs($user)->putJson("/api/v1/group-registration-cycles/{$created->id}",['status'=>'open'])->assertOk()->assertJsonPath('data.status','open');
    }

    public function test_authorized_administrator_can_move_and_remove_a_rostered_student_with_audited_reason(): void
    {
        $permission=Permission::where('code','group_registration.override')->firstOrFail();
        $role=Role::create(['code'=>'TEST_GROUP_OVERRIDE','name_key'=>'test.group.override']);
        $role->permissions()->attach($permission->id,['scope_type'=>'global']);
        $user=User::factory()->create();
        $user->roles()->attach($role);
        $subgroup=$this->group->subgroups()->firstOrFail();

        $this->actingAs($user)->putJson("/api/v1/group-registration-cycles/{$this->cycle->id}/students/{$this->student->id}/assignment",[
            'student_subgroup_id'=>$subgroup->id,
            'reason'=>'تثبيت الطالب بناءً على قرار إداري',
        ])->assertOk()->assertJsonPath('data.student_subgroup_id',$subgroup->id);
        $this->assertDatabaseHas('student_group_assignments',[
            'student_id'=>$this->student->id,
            'student_subgroup_id'=>$subgroup->id,
            'valid_until'=>null,
            'data_source'=>'administrative_override',
        ]);

        $this->actingAs($user)->putJson("/api/v1/group-registration-cycles/{$this->cycle->id}/students/{$this->student->id}/assignment",[
            'student_subgroup_id'=>null,
            'reason'=>'إخراج الطالب بناءً على طلب رسمي',
        ])->assertOk()->assertJsonPath('data',null);
        $this->assertSame(0,StudentGroupAssignment::where('student_id',$this->student->id)->whereNull('valid_until')->count());
        $this->assertTrue(AuditLog::where('student_id',$this->student->id)->where('is_override',true)->whereNotNull('override_reason')->exists());
    }

    public function test_subgroup_must_be_emptied_before_it_can_be_deleted_permanently(): void
    {
        $permission=Permission::where('code','group_registration.manage_groups')->firstOrFail();
        $role=Role::create(['code'=>'TEST_GROUP_MANAGER','name_key'=>'test.group.manager']);
        $role->permissions()->attach($permission->id,['scope_type'=>'global']);
        $user=User::factory()->create();
        $user->roles()->attach($role);
        $subgroup=$this->group->subgroups()->firstOrFail();
        $assignment=StudentGroupAssignment::create([
            'student_id'=>$this->student->id,'academic_year_id'=>$this->year->id,
            'student_group_id'=>$this->group->id,'student_subgroup_id'=>$subgroup->id,
            'valid_from'=>now()->toDateString(),'change_reason'=>'test',
        ]);

        $url="/api/v1/group-registration-cycles/{$this->cycle->id}/subgroups/{$subgroup->id}";
        $this->actingAs($user)->deleteJson($url)
            ->assertUnprocessable()
            ->assertJsonPath('errors.subgroup.0','يجب تفريغ جميع الطلبة من المجموعة الفرعية أولاً، ثم إعادة محاولة الحذف.');
        $this->assertDatabaseHas('student_subgroups',['id'=>$subgroup->id]);

        $assignment->update(['valid_until'=>now()->toDateString()]);
        $this->actingAs($user)->deleteJson($url)->assertOk();
        $this->assertDatabaseMissing('student_subgroups',['id'=>$subgroup->id]);
        $this->assertNull($assignment->fresh()->student_subgroup_id);
    }

    public function test_authorized_administrator_can_export_the_complete_cycle_roster_as_utf8_csv(): void
    {
        $permission=Permission::where('code','group_registration.export')->firstOrFail();
        $role=Role::create(['code'=>'TEST_GROUP_EXPORT','name_key'=>'test.group.export']);
        $role->permissions()->attach($permission->id,['scope_type'=>'global']);
        $user=User::factory()->create();
        $user->roles()->attach($role);
        $subgroup=$this->group->subgroups()->firstOrFail();
        StudentGroupAssignment::create([
            'student_id'=>$this->student->id,'academic_year_id'=>$this->year->id,
            'student_group_id'=>$this->group->id,'student_subgroup_id'=>$subgroup->id,
            'valid_from'=>now()->toDateString(),'change_reason'=>'test',
        ]);

        $response=$this->actingAs($user)->get("/api/v1/group-registration-cycles/{$this->cycle->id}/export");
        $response->assertOk()->assertHeader('content-type','text/csv; charset=UTF-8');
        $content=$response->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF",$content);
        $this->assertStringContainsString('22210466',$content);
        $this->assertStringContainsString($subgroup->name,$content);
    }
}
