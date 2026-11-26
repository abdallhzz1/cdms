<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('clinical_week_publications')) {
            Schema::create('clinical_week_publications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('window_id')->constrained('clinical_feedback_windows')->restrictOnDelete();
                $table->unsignedSmallInteger('week');
                $table->foreignId('published_by')->constrained('users')->restrictOnDelete();
                $table->timestamp('published_at');
                $table->unique(['window_id', 'week'], 'clinical_week_publication_uq');
            });
        }
    }

    public function down(): void
    {
        // Preserve staff publication decisions; disable the course window instead.
        throw new RuntimeException('Clinical publication decisions must be retained.');
    }
};
