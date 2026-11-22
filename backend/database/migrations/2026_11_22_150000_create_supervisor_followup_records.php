<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('supervisor_followup_records', function (Blueprint $t) {
            $t->id();
            $t->foreignId('supervisor_user_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $t->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $t->foreignId('training_site_id')->nullable()->constrained('training_sites')->nullOnDelete();
            $t->string('type', 20);
            $t->string('status', 20);
            $t->string('title');
            $t->text('body');
            $t->date('record_date');
            $t->date('end_date')->nullable();
            $t->boolean('visible_to_supervisor')->default(false);
            $t->text('review_note')->nullable();
            $t->timestamp('reviewed_at')->nullable();
            $t->timestamps();
            $t->softDeletes();
            $t->index(['supervisor_user_id', 'status', 'record_date'], 'sfr_user_status_date');
        });
        Schema::create('supervisor_followup_files', function (Blueprint $t) {
            $t->id();
            $t->foreignId('record_id')->constrained('supervisor_followup_records')->restrictOnDelete();
            $t->string('original_name');
            $t->string('storage_path');
            $t->string('mime_type');
            $t->unsignedBigInteger('size_bytes');
            $t->timestamps();
        });
        (new \Database\Seeders\SupervisorFollowupPermissionSeeder)->run();
    }
    public function down(): void
    {
        Schema::dropIfExists('supervisor_followup_files');
        Schema::dropIfExists('supervisor_followup_records');
    }
};
