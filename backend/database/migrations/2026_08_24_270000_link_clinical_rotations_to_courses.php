<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rotations', function (Blueprint $table) {
            $table->foreignId('course_id')->nullable()->after('academic_year_id')
                ->constrained('courses')->restrictOnDelete();
            $table->unique(['academic_year_id', 'course_id'], 'rotation_year_course_unique');
        });
    }

    public function down(): void
    {
        Schema::table('rotations', function (Blueprint $table) {
            $table->dropUnique('rotation_year_course_unique');
            $table->dropConstrainedForeignId('course_id');
        });
    }
};
