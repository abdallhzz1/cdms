<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('person_training_site')) {
            Schema::create('person_training_site', function (Blueprint $table) {
                $table->id();
                $table->foreignId('person_id')->constrained('people')->cascadeOnDelete();
                $table->foreignId('training_site_id')->constrained('training_sites')->cascadeOnDelete();
                $table->boolean('is_primary')->default(false);
                $table->timestamps();
                $table->unique(['person_id', 'training_site_id']);
            });
        }

        $now = now();
        DB::table('people')->whereNotNull('primary_site_id')->orderBy('id')->chunkById(200, function ($people) use ($now) {
            foreach ($people as $person) {
                DB::table('person_training_site')->updateOrInsert(
                    ['person_id' => $person->id, 'training_site_id' => $person->primary_site_id],
                    ['is_primary' => true, 'created_at' => $now, 'updated_at' => $now]
                );
            }
        });

        // On an existing installation the role is already seeded. Fresh test
        // databases seed roles after migrations, so they intentionally skip this.
        if (DB::table('roles')->where('code', 'CLINICAL_SUPERVISOR')->exists()) {
            (new Database\Seeders\SeedHospitalDoctorsSeeder())->run();
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('person_training_site');
    }
};
