<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_group_assignments', function (Blueprint $table) {
            $table->index(
                ['student_id', 'academic_year_id', 'valid_until'],
                'student_year_current_assignment_idx'
            );
        });

        Schema::table('students', function (Blueprint $table) {
            $table->index(['academic_advisor_id', 'registration_status'], 'student_advisor_status_idx');
            $table->index(
                ['academic_year_id', 'academic_level', 'registration_status'],
                'student_year_level_status_idx'
            );
        });

        Schema::table('student_course_enrollments', function (Blueprint $table) {
            $table->index(['course_id', 'academic_year_id', 'status'], 'enrollment_course_year_status_idx');
        });

        Schema::table('grade_entries', function (Blueprint $table) {
            $table->index(['status', 'student_course_enrollment_id'], 'grade_status_enrollment_idx');
        });

        Schema::table('advising_records', function (Blueprint $table) {
            $table->index(['student_id', 'meeting_date'], 'advising_student_date_idx');
            $table->index(['advisor_person_id', 'status'], 'advising_advisor_status_idx');
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->index(['entity_type', 'entity_id', 'created_at'], 'audit_entity_created_idx');
            $table->index(['user_id', 'action', 'created_at'], 'audit_user_action_created_idx');
        });

        Schema::table('quality_survey_responses', function (Blueprint $table) {
            $table->index(
                ['quality_survey_id', 'quality_survey_question_id', 'responded_at'],
                'survey_response_question_date_idx'
            );
        });

        Schema::table('sessions', function (Blueprint $table) {
            $table->index(['user_id', 'last_activity'], 'session_user_activity_idx');
        });
    }

    public function down(): void
    {
        Schema::table('sessions', fn (Blueprint $table) => $table->dropIndex('session_user_activity_idx'));
        Schema::table('quality_survey_responses', fn (Blueprint $table) => $table->dropIndex('survey_response_question_date_idx'));
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex('audit_entity_created_idx');
            $table->dropIndex('audit_user_action_created_idx');
        });
        Schema::table('advising_records', function (Blueprint $table) {
            $table->dropIndex('advising_student_date_idx');
            $table->dropIndex('advising_advisor_status_idx');
        });
        Schema::table('grade_entries', fn (Blueprint $table) => $table->dropIndex('grade_status_enrollment_idx'));
        Schema::table('student_course_enrollments', fn (Blueprint $table) => $table->dropIndex('enrollment_course_year_status_idx'));
        Schema::table('students', function (Blueprint $table) {
            $table->dropIndex('student_advisor_status_idx');
            $table->dropIndex('student_year_level_status_idx');
        });
        Schema::table('student_group_assignments', fn (Blueprint $table) => $table->dropIndex('student_year_current_assignment_idx'));
    }
};
