<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('student_policy_documents', function (Blueprint $table) {
            $table->id();
            $table->string('title_ar');
            $table->string('title_en');
            $table->string('version_label')->unique();
            $table->date('effective_date');
            $table->string('storage_path');
            $table->string('original_name');
            $table->string('mime_type', 100)->default('application/pdf');
            $table->unsignedBigInteger('size_bytes');
            $table->char('sha256', 64);
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });

        Schema::create('student_policy_campaigns', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('student_policy_document_id')->constrained()->restrictOnDelete();
            $table->foreignId('academic_year_id')->constrained()->restrictOnDelete();
            $table->json('target_levels');
            $table->date('deadline');
            $table->string('status', 20)->default('draft')->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['academic_year_id', 'status', 'deadline'], 'policy_campaign_year_status_deadline');
        });

        Schema::create('student_policy_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')->constrained('student_policy_campaigns')->restrictOnDelete();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->timestamp('opened_at')->nullable()->index();
            $table->timestamp('acknowledged_at')->nullable()->index();
            $table->string('acknowledged_name')->nullable();
            $table->string('acknowledged_version')->nullable();
            $table->char('acknowledged_document_sha256', 64)->nullable();
            $table->char('acknowledged_ip_hash', 64)->nullable();
            $table->char('acknowledged_user_agent_hash', 64)->nullable();
            $table->timestamp('paper_received_at')->nullable()->index();
            $table->foreignId('paper_received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('scan_storage_path')->nullable();
            $table->string('scan_original_name')->nullable();
            $table->string('scan_mime_type', 100)->nullable();
            $table->unsignedBigInteger('scan_size_bytes')->nullable();
            $table->char('scan_sha256', 64)->nullable();
            $table->timestamp('scan_uploaded_at')->nullable();
            $table->foreignId('scan_uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['campaign_id', 'student_id']);
        });

        Schema::create('student_policy_otp_challenges', function (Blueprint $table) {
            $table->id();
            $table->char('challenge_token_hash', 64)->unique();
            $table->foreignId('campaign_id')->constrained('student_policy_campaigns')->cascadeOnDelete();
            $table->foreignId('assignment_id')->nullable()->constrained('student_policy_assignments')->cascadeOnDelete();
            $table->char('otp_hash', 64)->nullable();
            $table->char('access_token_hash', 64)->nullable()->unique();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('access_expires_at')->nullable();
            $table->timestamps();
            $table->index(['campaign_id', 'expires_at'], 'policy_otp_campaign_expiry');
        });

        $now = now();
        DB::table('permissions')->insertOrIgnore([
            ['code' => 'student_policies.view', 'module' => 'Student Policies', 'action' => 'VIEW', 'description_key' => 'permissions.student_policies_view.description', 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'student_policies.manage', 'module' => 'Student Policies', 'action' => 'MANAGE', 'description_key' => 'permissions.student_policies_manage.description', 'created_at' => $now, 'updated_at' => $now],
        ]);
        $systemAdminId = DB::table('roles')->where('code', 'SYS_ADMIN')->value('id');
        if ($systemAdminId) {
            foreach (DB::table('permissions')->whereIn('code', ['student_policies.view', 'student_policies.manage'])->pluck('id') as $permissionId) {
                DB::table('role_permissions')->insertOrIgnore(['role_id' => $systemAdminId, 'permission_id' => $permissionId, 'scope_type' => 'global', 'created_at' => $now, 'updated_at' => $now]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('student_policy_otp_challenges');
        Schema::dropIfExists('student_policy_assignments');
        Schema::dropIfExists('student_policy_campaigns');
        Schema::dropIfExists('student_policy_documents');
        $permissionIds = DB::table('permissions')->whereIn('code', ['student_policies.view', 'student_policies.manage'])->pluck('id');
        DB::table('role_permissions')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('user_permission_grants')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
    }
};
