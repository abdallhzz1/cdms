<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_schedule_portal_settings', function (Blueprint $table) {
            $table->id();
            $table->boolean('is_enabled')->default(true);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        DB::table('student_schedule_portal_settings')->insert([
            'is_enabled' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('permissions')->updateOrInsert(
            ['code' => 'distribution.student_portal.manage'],
            [
                'module' => 'Distribution',
                'action' => 'MANAGE_STUDENT_PORTAL',
                'description_key' => 'permissions.distribution_student_portal_manage.description',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('student_schedule_portal_settings');
        DB::table('permissions')->where('code', 'distribution.student_portal.manage')->delete();
    }
};
