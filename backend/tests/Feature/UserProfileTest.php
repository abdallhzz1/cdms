<?php

namespace Tests\Feature;

use App\Models\Person;
use App\Models\User;
use App\Models\UserProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
            ->assertJsonPath('data.specialty', 'الجراحة العامة');

        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'د. اسم جديد']);
        $this->assertDatabaseHas('people', ['id' => $person->id, 'full_name_ar' => 'د. اسم جديد', 'specialty' => 'الجراحة العامة']);
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

        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('new-password', $user->fresh()->password));
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
}
