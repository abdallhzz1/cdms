<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('correspondence_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('correspondence_id')->constrained('correspondence')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('participant_role')->default('recipient');
            $table->timestamps();
            $table->unique(['correspondence_id', 'user_id'], 'corr_participant_unique');
            $table->index(['user_id', 'correspondence_id'], 'corr_participant_user_idx');
        });

        $now = now();
        DB::table('correspondence')->orderBy('id')->chunkById(200, function ($items) use ($now) {
            $rows = [];
            foreach ($items as $item) {
                if ($item->sender_id) {
                    $rows[] = ['correspondence_id' => $item->id, 'user_id' => $item->sender_id, 'participant_role' => 'sender', 'created_at' => $now, 'updated_at' => $now];
                }
                if ($item->assigned_to && $item->assigned_to !== $item->sender_id) {
                    $rows[] = ['correspondence_id' => $item->id, 'user_id' => $item->assigned_to, 'participant_role' => 'recipient', 'created_at' => $now, 'updated_at' => $now];
                }
            }
            if ($rows) DB::table('correspondence_participants')->insertOrIgnore($rows);
        });

        $roleGrants = [
            'SYS_ADMIN' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward', 'correspondence.approve', 'correspondence.close'],
            'CLINICAL_DIRECTOR' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward', 'correspondence.approve', 'correspondence.close'],
            'DEAN' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward', 'correspondence.approve', 'correspondence.close'],
            'VICE_DEAN' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward', 'correspondence.approve', 'correspondence.close'],
            'DEPARTMENT_HEAD' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward', 'correspondence.approve', 'correspondence.close'],
            'ADMIN_ASSISTANT' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward', 'correspondence.close'],
            'RTA' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward'],
            'ACADEMIC_ADVISOR' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward'],
            'QUALITY' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward'],
            'CLINICAL_SUPERVISOR' => ['correspondence.view', 'correspondence.create', 'correspondence.update', 'correspondence.submit', 'correspondence.forward'],
        ];

        foreach ($roleGrants as $roleCode => $codes) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (! $roleId) continue;
            $permissionIds = DB::table('permissions')->whereIn('code', $codes)->pluck('id');
            foreach ($permissionIds as $permissionId) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['scope_type' => 'global', 'created_at' => $now, 'updated_at' => $now],
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('correspondence_participants');
    }
};
