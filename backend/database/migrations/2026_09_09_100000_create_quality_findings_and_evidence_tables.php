<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('quality_findings', function (Blueprint $table) {
            $table->id(); $table->string('reference')->unique(); $table->string('academic_year')->nullable();
            $table->string('source'); $table->string('category')->nullable(); $table->string('title'); $table->text('description');
            $table->string('severity')->default('medium'); $table->string('status')->default('open'); $table->boolean('is_recurring')->default(false);
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete(); $table->date('due_date')->nullable();
            $table->text('root_cause')->nullable(); $table->text('recommended_action')->nullable(); $table->text('evidence_reference')->nullable();
            $table->foreignId('quality_improvement_plan_id')->nullable()->constrained('quality_improvement_plans')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete(); $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete(); $table->timestamp('closed_at')->nullable();
            $table->timestamps(); $table->index(['status','severity','due_date']);
        });
        Schema::create('quality_evidence', function (Blueprint $table) {
            $table->id(); $table->string('code')->unique(); $table->string('title'); $table->string('category')->nullable();
            $table->text('description')->nullable(); $table->string('reference_url', 2000)->nullable(); $table->string('document_version')->nullable();
            $table->date('issued_at')->nullable(); $table->date('expires_at')->nullable(); $table->string('status')->default('draft');
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete(); $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps(); $table->index(['status','expires_at']);
        });
    }
    public function down(): void { Schema::dropIfExists('quality_evidence'); Schema::dropIfExists('quality_findings'); }
};
