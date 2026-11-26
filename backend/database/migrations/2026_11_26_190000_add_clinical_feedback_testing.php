<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('clinical_feedback_test_runs')) {
            Schema::create('clinical_feedback_test_runs', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->foreignId('created_by')->constrained('users')->cascadeOnDelete();
                $t->foreignId('student_id')->constrained()->cascadeOnDelete();
                $t->timestamp('expires_at');
                $t->timestamps();
            });
        }
        if (! Schema::hasTable('clinical_feedback_test_answers')) {
            Schema::create('clinical_feedback_test_answers', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('test_run_id');
                $t->foreign('test_run_id', 'cf_test_answer_run_fk')->references('id')->on('clinical_feedback_test_runs')->cascadeOnDelete();
                $t->foreignId('window_id')->constrained('clinical_feedback_windows')->cascadeOnDelete();
                $t->string('slot_key', 80);
                $t->unsignedTinyInteger('experience')->nullable();
                $t->unsignedTinyInteger('supervision')->nullable();
                $t->text('private_comment')->nullable();
                $t->unique(['test_run_id', 'window_id', 'slot_key'], 'cf_test_answer_slot_uq');
            });
        }
        foreach (['test', 'delete_test'] as $action) {
            $code = 'clinical_feedback.'.$action;
            DB::table('permissions')->updateOrInsert(['code' => $code], ['module' => 'Clinical Student Feedback', 'action' => strtoupper($action), 'description_key' => 'permissions.clinical_feedback_'.$action.'.description', 'created_at' => now(), 'updated_at' => now()]);
            foreach (DB::table('roles')->where('code', 'ADMIN_ASSISTANT')->pluck('id') as $role) {
                DB::table('role_permissions')->insertOrIgnore(['role_id' => $role, 'permission_id' => DB::table('permissions')->where('code', $code)->value('id'), 'scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()]);
            }
        }
    }

    public function down(): void
    {
        // Test data is disposable and is stored separately from academic feedback.
        Schema::dropIfExists('clinical_feedback_test_answers');
        Schema::dropIfExists('clinical_feedback_test_runs');
    }
};
