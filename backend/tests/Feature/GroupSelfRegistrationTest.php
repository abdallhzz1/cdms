<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
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

        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/options",['access_token'=>$token])
            ->assertOk()->assertJsonPath('data.main_group','L')->assertJsonCount(2,'data.subgroups')->assertJsonMissing(['M1']);
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/select",['access_token'=>$token,'subgroup_id'=>$otherSub->id])->assertUnprocessable();
        $target=$this->group->subgroups()->first();
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/select",['access_token'=>$token,'subgroup_id'=>$target->id])->assertOk();
        $this->assertDatabaseHas('student_group_assignments',['student_id'=>$this->student->id,'student_subgroup_id'=>$target->id,'valid_until'=>null]);
        $this->postJson("/api/v1/public/group-registration/{$this->cycle->public_id}/withdraw",['access_token'=>$token])->assertOk();
        $this->assertSame(0,StudentGroupAssignment::where('student_subgroup_id',$target->id)->whereNull('valid_until')->count());
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
}
