<?php

namespace Tests\Feature;

use App\Models\Person;
use App\Models\Role;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_any_authenticated_user_can_view_and_update_their_shared_profile(): void
    {
        $user = User::factory()->create(['name' => 'Old Name']);
        $person = Person::factory()->create([
            'user_id' => $user->id,
            'full_name_ar' => 'الاسم السابق',
            'phone' => '0590000000',
            'specialty' => 'الطب الباطني',
            'academic_degree' => 'أستاذ مساعد',
        ]);

        $this->actingAs($user, 'web')
            ->getJson('/api/v1/profile/me')
            ->assertOk()
            ->assertJsonPath('data.name', 'الاسم السابق');

        $this->actingAs($user, 'web')
            ->putJson('/api/v1/profile/me', [
                'name' => 'د. اسم جديد',
                'full_name_en' => 'Dr. New Name',
                'phone' => '0591111111',
                'specialty' => 'الجراحة العامة',
                'academic_degree' => 'أستاذ مساعد',
                'bio' => 'نبذة مهنية مختصرة.',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'د. اسم جديد')
            ->assertJsonPath('data.specialty', 'الطب الباطني');

        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'د. اسم جديد']);
        $this->assertDatabaseHas('people', ['id' => $person->id, 'full_name_ar' => 'د. اسم جديد', 'specialty' => 'الطب الباطني']);
        $this->assertDatabaseHas('user_profiles', ['user_id' => $user->id, 'full_name_en' => 'Dr. New Name']);
    }

    public function test_profile_password_change_requires_the_current_password(): void
    {
        $user = User::factory()->create(['password' => 'current-password']);
        $this->actingAs($user, 'web')
            ->putJson('/api/v1/profile/me/password', [
                'current_password' => 'wrong-password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])
            ->assertStatus(422);

        $this->actingAs($user, 'web')
            ->putJson('/api/v1/profile/me/password', [
                'current_password' => 'current-password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('new-password', $user->fresh()->password));
    }

    public function test_profile_uses_existing_shared_data_without_creating_duplicate_person_records(): void
    {
        $user = User::factory()->create();
        UserProfile::create(['user_id' => $user->id, 'phone' => '0592222222']);

        $this->actingAs($user, 'web')
            ->getJson('/api/v1/profile/me')
            ->assertOk()
            ->assertJsonPath('data.phone', '0592222222');

        $this->assertDatabaseCount('people', 0);
    }

    public function test_supervisor_professional_record_is_saved_once_and_exposed_by_the_shared_profile(): void
    {
        $user = User::factory()->create();
        $role = Role::create([
            'code' => 'CLINICAL_SUPERVISOR',
            'name_key' => 'roles.clinical_supervisor',
            'description_key' => 'roles.clinical_supervisor_description',
        ]);
        $user->roles()->attach($role);

        $this->actingAs($user, 'web')->putJson('/api/v1/profile/me/professional', [
            'bio' => 'استشاري طب باطني.',
            'publications' => [['title' => 'Clinical paper', 'journal' => 'HU Journal', 'year' => 2026, 'doi' => null]],
            'conferences' => [['name' => 'Medical Conference', 'location' => 'Hebron', 'date' => '2026-09-12', 'role' => 'Speaker']],
        ])->assertOk()
            ->assertJsonPath('data.capabilities.clinical_supervisor', true)
            ->assertJsonPath('data.professional.publications.0.title', 'Clinical paper');

        $this->assertDatabaseHas('user_profiles', ['user_id' => $user->id, 'bio' => 'استشاري طب باطني.']);
        $this->assertDatabaseHas('clinical_supervisor_profiles', ['user_id' => $user->id, 'cv_summary' => 'استشاري طب باطني.']);
    }

    public function test_non_professional_account_cannot_create_a_clinical_profile_through_me_route(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'web')
            ->getJson('/api/v1/clinical-supervisors/me')
            ->assertNotFound();

        $this->actingAs($user, 'web')
            ->putJson('/api/v1/profile/me/professional', [
                'bio' => null,
                'publications' => [],
                'conferences' => [],
            ])->assertForbidden();
    }
}
