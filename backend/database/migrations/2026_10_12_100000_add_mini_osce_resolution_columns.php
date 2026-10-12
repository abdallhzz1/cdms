<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clinical_mini_osce_scores', function (Blueprint $table): void {
            $table->timestamp('superseded_at')->nullable()->after('max_score');
            $table->unsignedBigInteger('superseded_by_score_id')->nullable()->after('superseded_at');
            $table->foreignId('superseded_by_user_id')->nullable()->after('superseded_by_score_id')
                ->constrained('users')->nullOnDelete();
            $table->index(['distribution_version_id', 'superseded_at'], 'mini_osce_version_active_idx');
        });
    }

    public function down(): void
    {
        Schema::table('clinical_mini_osce_scores', function (Blueprint $table): void {
            $table->dropIndex('mini_osce_version_active_idx');
            $table->dropConstrainedForeignId('superseded_by_user_id');
            $table->dropColumn(['superseded_at', 'superseded_by_score_id']);
        });
    }
};
