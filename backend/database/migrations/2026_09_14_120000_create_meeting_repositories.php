<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meeting_repositories', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->text('share_token');
            $table->char('share_token_hash', 64)->unique();
            $table->boolean('is_active')->default(true)->index();
            $table->boolean('allow_download')->default(true);
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamp('last_accessed_at')->nullable();
            $table->unsignedBigInteger('access_count')->default(0);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('meeting_repository_meeting', function (Blueprint $table) {
            $table->foreignId('meeting_repository_id')->constrained()->cascadeOnDelete();
            $table->foreignId('meeting_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['meeting_repository_id', 'meeting_id'], 'meeting_repository_meeting_pk');
        });

        Schema::create('meeting_repository_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('meeting_repository_id')->constrained()->cascadeOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->string('original_name');
            $table->string('stored_path');
            $table->string('mime_type', 150);
            $table->unsignedBigInteger('file_size');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['meeting_repository_id', 'created_at'], 'meeting_repository_files_repo_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meeting_repository_files');
        Schema::dropIfExists('meeting_repository_meeting');
        Schema::dropIfExists('meeting_repositories');
    }
};
