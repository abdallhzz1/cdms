<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('basic_otp_challenges', function (Blueprint $table) {
            // Distinguishes event verification from a basic-lecture challenge.
            $table->unsignedBigInteger('student_event_id')->nullable()->index();
        });
        Schema::table('student_event_attendances', function (Blueprint $table) {
            $table->unsignedBigInteger('student_id')->nullable()->change();
            $table->foreignId('basic_student_id')->nullable()->after('student_id')
                ->constrained('basic_students')->restrictOnDelete();
            $table->string('university_number', 20)->nullable()->after('basic_student_id');
            $table->string('academic_level', 20)->nullable()->after('university_number');
        });

        DB::table('student_event_attendances')->whereNotNull('student_id')->orderBy('id')->chunkById(200, function ($rows) {
            foreach ($rows as $row) {
                $student = DB::table('students')->where('id', $row->student_id)->first(['university_number', 'academic_level']);
                if ($student) DB::table('student_event_attendances')->where('id', $row->id)->update([
                    'university_number' => $student->university_number, 'academic_level' => $student->academic_level,
                ]);
            }
        });

        Schema::table('student_event_attendances', function (Blueprint $table) {
            $table->unique(['student_event_id', 'university_number'], 'event_attendance_number_unique');
            $table->unique(['student_event_id', 'basic_student_id'], 'event_attendance_basic_unique');
        });
    }

    public function down(): void
    {
        if (DB::table('student_event_attendances')->whereNotNull('basic_student_id')->exists())
            throw new RuntimeException('Cannot roll back while basic student event attendance exists. Preserve or migrate those records first.');
        Schema::table('student_event_attendances', function (Blueprint $table) {
            $table->dropUnique('event_attendance_basic_unique');
            $table->dropUnique('event_attendance_number_unique');
            $table->dropForeign(['basic_student_id']);
            $table->dropColumn(['basic_student_id', 'university_number', 'academic_level']);
            $table->unsignedBigInteger('student_id')->nullable(false)->change();
        });
        Schema::table('basic_otp_challenges', fn (Blueprint $table) => $table->dropColumn('student_event_id'));
    }
};
