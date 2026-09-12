<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('correspondence', function (Blueprint $table) {
            $table->string('message_type', 24)->default('message')->after('category');
            $table->string('confidentiality', 24)->default('normal')->after('message_type');
            $table->json('tags')->nullable()->after('confidentiality');
            $table->timestamp('last_message_at')->nullable()->after('submitted_at');
            $table->index(['status', 'last_message_at'], 'corr_status_last_message_idx');
            $table->index(['message_type', 'response_due_date'], 'corr_type_due_idx');
        });

        Schema::table('correspondence_participants', function (Blueprint $table) {
            $table->timestamp('read_at')->nullable()->after('participant_role');
            $table->timestamp('archived_at')->nullable()->after('read_at');
            $table->timestamp('starred_at')->nullable()->after('archived_at');
            $table->timestamp('deleted_at')->nullable()->after('starred_at');
            $table->index(['user_id', 'archived_at', 'read_at'], 'corr_participant_mailbox_idx');
        });

        Schema::create('correspondence_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('subject', 500)->nullable();
            $table->text('body');
            $table->string('message_type', 24)->default('message');
            $table->string('priority', 24)->default('normal');
            $table->timestamps();
            $table->index(['created_by', 'name'], 'corr_template_owner_name_idx');
        });

        $now = now();
        $closedIds = DB::table('correspondence')->where('status', 'closed')->pluck('id');
        if ($closedIds->isNotEmpty()) {
            DB::table('correspondence_participants')->whereIn('correspondence_id', $closedIds)->update(['archived_at' => $now]);
        }
        DB::table('correspondence')->where('status', '!=', 'draft')->update([
            'status' => 'sent',
            'last_message_at' => DB::raw('COALESCE(submitted_at, created_at)'),
            'approved_at' => null,
            'returned_at' => null,
        ]);
        DB::table('correspondence')->where('status', 'draft')->update(['last_message_at' => DB::raw('created_at')]);

        DB::table('correspondence_participants')
            ->where('participant_role', 'recipient')
            ->update(['participant_role' => 'to']);
        DB::table('correspondence_participants')
            ->where('participant_role', 'sender')
            ->update(['read_at' => $now]);

        if (Schema::hasTable('approval_workflows')) {
            $workflowId = DB::table('approval_workflows')->where('code', 'correspondence')->value('id');
            if ($workflowId) {
                DB::table('approval_requests')
                    ->where('approval_workflow_id', $workflowId)
                    ->where('status', 'pending')
                    ->update(['status' => 'cancelled', 'completed_at' => $now, 'updated_at' => $now]);
                DB::table('approval_workflows')->where('id', $workflowId)->update(['is_active' => false, 'updated_at' => $now]);
            }
        }

        $permissionIds = DB::table('permissions')->whereIn('code', ['correspondence.approve', 'correspondence.close'])->pluck('id');
        if ($permissionIds->isNotEmpty()) {
            DB::table('role_permissions')->whereIn('permission_id', $permissionIds)->delete();
            DB::table('permissions')->whereIn('id', $permissionIds)->delete();
        }
    }

    public function down(): void
    {
        DB::table('permissions')->updateOrInsert(['code' => 'correspondence.approve'], ['module' => 'Correspondence', 'action' => 'APPROVE', 'description_key' => 'permissions.correspondence_approve.description', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('permissions')->updateOrInsert(['code' => 'correspondence.close'], ['module' => 'Correspondence', 'action' => 'CLOSE', 'description_key' => 'permissions.correspondence_close.description', 'created_at' => now(), 'updated_at' => now()]);
        Schema::dropIfExists('correspondence_templates');
        Schema::table('correspondence_participants', function (Blueprint $table) {
            $table->dropIndex('corr_participant_mailbox_idx');
            $table->dropColumn(['read_at', 'archived_at', 'starred_at', 'deleted_at']);
        });
        Schema::table('correspondence', function (Blueprint $table) {
            $table->dropIndex('corr_status_last_message_idx');
            $table->dropIndex('corr_type_due_idx');
            $table->dropColumn(['message_type', 'confidentiality', 'tags', 'last_message_at']);
        });
    }
};
