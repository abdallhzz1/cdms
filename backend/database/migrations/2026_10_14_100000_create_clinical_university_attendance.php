<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // MySQL DDL is not transactional: a previous failed run may have left
        // one or two empty tables behind. Complete them instead of dropping data.
        if (! Schema::hasTable('clinical_university_lectures')) Schema::create('clinical_university_lectures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_group_id');
            $table->foreignId('supervisor_person_id');
            $table->string('title', 160);
            $table->string('weekday', 12);
            $table->time('starts_at');
            $table->time('ends_at');
            $table->date('starts_on');
            $table->date('ends_on');
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by_user_id')->nullable();
            $table->timestamps();
            $table->index(['student_group_id', 'is_active', 'starts_on', 'ends_on'], 'university_lectures_group_dates_idx');
            $table->index(['supervisor_person_id', 'is_active', 'starts_on', 'ends_on'], 'university_lectures_supervisor_dates_idx');
        });

        if (! Schema::hasTable('clinical_university_sessions')) Schema::create('clinical_university_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinical_university_lecture_id');
            $table->date('session_date');
            $table->foreignId('supervisor_person_id');
            $table->foreignId('recorded_by_user_id')->nullable();
            $table->timestamps();
            $table->unique(['clinical_university_lecture_id', 'session_date'], 'university_session_lecture_date_unique');
        });

        if (! Schema::hasTable('clinical_university_attendance_records')) Schema::create('clinical_university_attendance_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinical_university_session_id');
            $table->foreignId('student_id');
            $table->foreignId('student_subgroup_id')->nullable();
            $table->string('status', 16);
            $table->text('excuse_note')->nullable();
            $table->foreignId('recorded_by_user_id')->nullable();
            $table->timestamps();
            $table->unique(['clinical_university_session_id', 'student_id'], 'university_attendance_student_unique');
        });

        $this->ensureIndex('clinical_university_lectures', ['student_group_id', 'is_active', 'starts_on', 'ends_on'], 'university_lectures_group_dates_idx');
        $this->ensureIndex('clinical_university_lectures', ['supervisor_person_id', 'is_active', 'starts_on', 'ends_on'], 'university_lectures_supervisor_dates_idx');
        $this->ensureIndex('clinical_university_sessions', ['clinical_university_lecture_id', 'session_date'], 'university_session_lecture_date_unique', true);
        $this->ensureIndex('clinical_university_attendance_records', ['clinical_university_session_id', 'student_id'], 'university_attendance_student_unique', true);

        $this->ensureForeign('clinical_university_lectures', 'student_group_id', 'student_groups', 'cu_lectures_group_fk');
        $this->ensureForeign('clinical_university_lectures', 'supervisor_person_id', 'people', 'cu_lectures_supervisor_fk');
        $this->ensureForeign('clinical_university_lectures', 'created_by_user_id', 'users', 'cu_lectures_creator_fk', 'set null');
        $this->ensureForeign('clinical_university_sessions', 'clinical_university_lecture_id', 'clinical_university_lectures', 'cu_sessions_lecture_fk');
        $this->ensureForeign('clinical_university_sessions', 'supervisor_person_id', 'people', 'cu_sessions_supervisor_fk');
        $this->ensureForeign('clinical_university_sessions', 'recorded_by_user_id', 'users', 'cu_sessions_recorder_fk', 'set null');
        $this->ensureForeign('clinical_university_attendance_records', 'clinical_university_session_id', 'clinical_university_sessions', 'cu_records_session_fk');
        $this->ensureForeign('clinical_university_attendance_records', 'student_id', 'students', 'cu_records_student_fk');
        $this->ensureForeign('clinical_university_attendance_records', 'student_subgroup_id', 'student_subgroups', 'cu_records_subgroup_fk', 'set null');
        $this->ensureForeign('clinical_university_attendance_records', 'recorded_by_user_id', 'users', 'cu_records_recorder_fk', 'set null');
    }

    private function ensureIndex(string $table, array $columns, string $name, bool $unique = false): void
    {
        if (Schema::hasIndex($table, $name)) return;
        Schema::table($table, function (Blueprint $blueprint) use ($columns, $name, $unique): void {
            if ($unique) $blueprint->unique($columns, $name);
            else $blueprint->index($columns, $name);
        });
    }

    private function ensureForeign(string $table, string $column, string $references, string $name, string $onDelete = 'restrict'): void
    {
        foreach (Schema::getForeignKeys($table) as $foreign) {
            if ($foreign['columns'] === [$column]) return;
        }
        Schema::table($table, function (Blueprint $blueprint) use ($column, $references, $name, $onDelete): void {
            $blueprint->foreign($column, $name)->references('id')->on($references)->onDelete($onDelete);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_university_attendance_records');
        Schema::dropIfExists('clinical_university_sessions');
        Schema::dropIfExists('clinical_university_lectures');
    }
};
