<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('clinical_portal_challenges')) {
            Schema::create('clinical_portal_challenges', function (Blueprint $t) {
                $t->id();
                $t->string('token_hash', 64)->unique();
                $t->foreignId('student_id')->nullable()->constrained()->cascadeOnDelete();
                $t->string('otp_hash');
                $t->unsignedTinyInteger('attempts')->default(0);
                $t->timestamp('expires_at');
                $t->timestamp('consumed_at')->nullable();
            });
        }
        if (! Schema::hasTable('clinical_portal_sessions')) {
            Schema::create('clinical_portal_sessions', function (Blueprint $t) {
                $t->id();
                $t->foreignId('student_id')->constrained()->cascadeOnDelete();
                $t->string('token_hash', 64)->unique();
                $t->timestamp('expires_at')->index();
                $t->timestamp('revoked_at')->nullable();
            });
        }
        if (! Schema::hasTable('clinical_feedback_windows')) {
            Schema::create('clinical_feedback_windows', function (Blueprint $t) {
                $t->id();
                $t->foreignId('rotation_id')->unique()->constrained()->cascadeOnDelete();
                $t->boolean('is_enabled')->default(false);
                $t->unsignedSmallInteger('from_week')->default(1);
                $t->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $t->timestamps();
            });
        }
        if (! Schema::hasTable('clinical_mark_releases')) {
            Schema::create('clinical_mark_releases', function (Blueprint $t) {
                $t->id();
                $t->uuid('public_id')->unique();
                $t->foreignId('window_id')->constrained('clinical_feedback_windows')->restrictOnDelete();
                $t->foreignId('student_id')->constrained()->restrictOnDelete();
                $t->foreignId('assessment_id')->constrained('clinical_assessments')->restrictOnDelete();
                $t->string('slot_key', 80);
                $t->string('kind', 16);
                $t->unsignedSmallInteger('from_week');
                $t->unsignedSmallInteger('to_week');
                $t->date('starts_on');
                $t->date('ends_on');
                $t->foreignId('supervisor_id')->constrained('people')->restrictOnDelete();
                $t->decimal('score', 6, 2);
                $t->decimal('max_score', 6, 2);
                $t->unsignedInteger('revision')->default(1);
                $t->timestamp('released_at');
                $t->foreignId('released_by')->constrained('users')->restrictOnDelete();
                $t->unique(['window_id', 'student_id', 'slot_key'], 'cf_mark_slot_uq');
            });
        }
        // Deliberately no answer ID, precise submission timestamp or shared identifier.
        if (! Schema::hasTable('clinical_feedback_participations')) {
            Schema::create('clinical_feedback_participations', function (Blueprint $t) {
                $t->id();
                $t->foreignId('window_id')->constrained('clinical_feedback_windows')->restrictOnDelete();
                $t->foreignId('student_id')->constrained()->restrictOnDelete();
                $t->string('slot_key', 80);
                $t->date('completed_on');
                $t->unique(['window_id', 'student_id', 'slot_key'], 'cf_participation_slot_uq');
            });
        }
        if (! Schema::hasTable('clinical_feedback_batches')) {
            Schema::create('clinical_feedback_batches', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->foreignId('window_id')->constrained('clinical_feedback_windows')->restrictOnDelete();
                $t->foreignId('supervisor_id')->constrained('people')->restrictOnDelete();
                $t->string('slot_key', 80);
                $t->unsignedSmallInteger('from_week');
                $t->unsignedSmallInteger('to_week');
                $t->date('released_on');
            });
        }
        if (! Schema::hasTable('clinical_feedback_answers')) {
            Schema::create('clinical_feedback_answers', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->foreignId('window_id')->constrained('clinical_feedback_windows')->restrictOnDelete();
                $t->foreignId('supervisor_id')->constrained('people')->restrictOnDelete();
                $t->string('slot_key', 80);
                $t->unsignedSmallInteger('from_week');
                $t->unsignedSmallInteger('to_week');
                $t->unsignedTinyInteger('experience')->nullable();
                $t->unsignedTinyInteger('supervision')->nullable();
                $t->text('private_comment')->nullable();
                $t->text('reviewed_comment')->nullable();
                $t->string('follow_up', 20)->default('new');
                $t->uuid('batch_id')->nullable();
                $t->foreign('batch_id', 'cf_answer_batch_fk')->references('id')->on('clinical_feedback_batches')->restrictOnDelete();
                $t->index(['window_id', 'batch_id'], 'cf_answer_window_batch_idx');
            });
        }

        foreach (['view', 'comments', 'moderate', 'manage', 'publish_marks'] as $action) {
            $code = 'clinical_feedback.'.$action;
            DB::table('permissions')->updateOrInsert(['code' => $code], ['module' => 'Clinical Student Feedback', 'action' => strtoupper($action), 'description_key' => 'permissions.clinical_feedback_'.$action.'.description', 'created_at' => now(), 'updated_at' => now()]);
            $roles = $action === 'view' || $action === 'comments' ? ['CLINICAL_DIRECTOR', 'DEAN', 'VICE_DEAN', 'QUALITY'] : ($action === 'moderate' ? ['CLINICAL_DIRECTOR', 'QUALITY'] : ['CLINICAL_DIRECTOR']);
            foreach (DB::table('roles')->whereIn('code', $roles)->pluck('id') as $roleId) {
                DB::table('role_permissions')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => DB::table('permissions')->where('code', $code)->value('id'), 'scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()]);
            }
        }
    }

    public function down(): void
    {
        // Academic publication and feedback history are intentionally retained.
        throw new RuntimeException('This migration contains confidential academic history; rollback requires an explicit retention plan.');
    }
};
