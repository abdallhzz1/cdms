<?php

use App\Models\Correspondence;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('correspondence_participants')) return;

        DB::table('workflow_transition_logs')
            ->where('entity_type', Correspondence::class)
            ->whereNotNull('user_id')
            ->whereExists(fn ($query) => $query->selectRaw('1')->from('correspondence')->whereColumn('correspondence.id', 'workflow_transition_logs.entity_id'))
            ->orderBy('id')
            ->chunkById(200, function ($logs) {
                $now = now();
                $rows = $logs->map(fn ($log) => [
                    'correspondence_id' => $log->entity_id,
                    'user_id' => $log->user_id,
                    'participant_role' => 'workflow_actor',
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all();
                if ($rows) DB::table('correspondence_participants')->insertOrIgnore($rows);
            });
    }

    public function down(): void
    {
        // Historical participant access is intentionally retained on rollback.
    }
};
