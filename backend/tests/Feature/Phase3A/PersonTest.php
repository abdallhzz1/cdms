<?php

namespace Tests\Feature\Phase3A;

use App\Models\Department;
use App\Models\Person;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PersonTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, PermissionSeeder::class, Phase3PermissionSeeder::class, RolePermissionSeeder::class]);
        
        $sysAdminRole = \App\Models\Role::where('code', 'SYS_ADMIN')->first();
        $sysAdminRole->permissions()->sync(\App\Models\Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($sysAdminRole);
    }

    public function test_can_list_people()
    {
        Person::factory()->count(4)->create();

        $response = $this->actingAs($this->admin)->getJson('/api/v1/people');

        $response->assertStatus(200)->assertJsonCount(4, 'data');
    }

    public function test_can_create_person_with_department()
    {
        $dept = Department::factory()->create();
        $user = User::factory()->create(); // system access user

        $payload = [
            'staff_code' => 'DR-9999',
            'full_name_ar' => 'د. أحمد',
            'department_id' => $dept->id,
            'contract_type' => 'full_time',
            'user_id' => $user->id,
        ];

        $response = $this->actingAs($this->admin)->postJson('/api/v1/people', $payload);

        $response->assertStatus(201)->assertJsonPath('data.staff_code', 'DR-9999');
        
        $this->assertDatabaseHas('people', [
            'staff_code' => 'DR-9999',
            'department_id' => $dept->id,
            'user_id' => $user->id,
        ]);
    }

    public function test_cannot_assign_same_user_to_multiple_people()
    {
        $user = User::factory()->create();
        Person::factory()->create(['user_id' => $user->id]);

        $payload = [
            'full_name_ar' => 'د. محمود',
            'user_id' => $user->id,
        ];

        $response = $this->actingAs($this->admin)->postJson('/api/v1/people', $payload);

        $response->assertStatus(422)
            ->assertJsonValidationErrors('user_id');
    }
}
