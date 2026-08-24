<?php

namespace Tests\Feature;

use App\Models\Person;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SeedHospitalDoctorsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class HospitalDoctorDirectorySeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_official_directory_creates_accounts_and_multi_hospital_affiliations_idempotently(): void
    {
        $this->seed(RoleSeeder::class);
        $this->seed(SeedHospitalDoctorsSeeder::class);
        $this->seed(SeedHospitalDoctorsSeeder::class);

        $this->assertSame(65, User::whereHas('roles', fn ($query) => $query->where('code', 'CLINICAL_SUPERVISOR'))->count());
        $this->assertSame(66, DB::table('person_training_site')->count());

        $user = User::where('email', 'mohammad.zhour@hebron.edu')->firstOrFail();
        $person = Person::where('user_id', $user->id)->firstOrFail();
        $this->assertEqualsCanonicalizing(
            ['م. الهلال', 'م. يطا'],
            $person->trainingSites()->pluck('name_ar')->all()
        );
        $this->assertFalse(Hash::check('password123', $user->password));
    }
}
