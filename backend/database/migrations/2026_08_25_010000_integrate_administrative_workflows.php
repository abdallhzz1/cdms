<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('correspondence', function (Blueprint $table) {
            $table->string('category')->default('general')->after('direction');
            $table->date('response_due_date')->nullable()->after('correspondence_date');
            $table->timestamp('read_at')->nullable()->after('submitted_at');
            $table->timestamp('returned_at')->nullable()->after('read_at');
            $table->timestamp('approved_at')->nullable()->after('returned_at');
            $table->foreignId('closed_by')->nullable()->after('closed_at')->constrained('users')->nullOnDelete();
            $table->text('close_notes')->nullable()->after('closed_by');
            $table->index(['assigned_to', 'status', 'correspondence_date'], 'corr_inbox_status_date_idx');
            $table->index(['sender_id', 'correspondence_date'], 'corr_sender_date_idx');
        });

        Schema::table('meetings', function (Blueprint $table) {
            $table->string('status')->default('draft')->after('meeting_type');
            $table->foreignId('created_by')->nullable()->after('implementation_owner')->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->timestamp('cancelled_at')->nullable()->after('approved_at');
            $table->text('cancellation_reason')->nullable()->after('cancelled_at');
            $table->index(['status', 'meeting_date'], 'meetings_status_date_idx');
        });

        Schema::table('operational_tasks', function (Blueprint $table) {
            $table->foreignId('created_by')->nullable()->after('id')->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_to')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->string('source_type')->nullable()->after('assigned_to');
            $table->unsignedBigInteger('source_id')->nullable()->after('source_type');
            $table->timestamp('started_at')->nullable()->after('status');
            $table->timestamp('completed_at')->nullable()->after('started_at');
            $table->text('completion_notes')->nullable()->after('completed_at');
            $table->index(['assigned_to', 'status', 'due_date'], 'tasks_assignee_status_due_idx');
            $table->index(['source_type', 'source_id'], 'tasks_source_idx');
        });

        Schema::table('meeting_action_items', function (Blueprint $table) {
            $table->foreignId('assigned_to')->nullable()->after('responsible')->constrained('users')->nullOnDelete();
            $table->foreignId('operational_task_id')->nullable()->after('assigned_to')->constrained('operational_tasks')->nullOnDelete();
        });

        Schema::create('correspondence_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('correspondence_id')->constrained('correspondence')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('original_name');
            $table->string('stored_path');
            $table->string('mime_type', 150)->nullable();
            $table->unsignedBigInteger('file_size');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('correspondence_attachments');
        Schema::table('meeting_action_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('operational_task_id');
            $table->dropConstrainedForeignId('assigned_to');
        });
        Schema::table('operational_tasks', function (Blueprint $table) {
            $table->dropIndex('tasks_source_idx');
            $table->dropIndex('tasks_assignee_status_due_idx');
            $table->dropConstrainedForeignId('assigned_to');
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['source_type', 'source_id', 'started_at', 'completed_at', 'completion_notes']);
        });
        Schema::table('meetings', function (Blueprint $table) {
            $table->dropIndex('meetings_status_date_idx');
            $table->dropConstrainedForeignId('approved_by');
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['status', 'approved_at', 'cancelled_at', 'cancellation_reason']);
        });
        Schema::table('correspondence', function (Blueprint $table) {
            $table->dropIndex('corr_sender_date_idx');
            $table->dropIndex('corr_inbox_status_date_idx');
            $table->dropConstrainedForeignId('closed_by');
            $table->dropColumn(['category', 'response_due_date', 'read_at', 'returned_at', 'approved_at', 'close_notes']);
        });
    }
};
