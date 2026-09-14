<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL DDL is not transactional. A failed first deployment may leave
        // the first table behind while this migration remains unrecorded.
        Schema::dropIfExists('confidential_financial_access_sessions');
        Schema::dropIfExists('confidential_financial_files');
        Schema::dropIfExists('confidential_financial_vaults');

        Schema::create('confidential_financial_vaults', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->text('share_token');
            $table->char('share_token_hash', 64)->unique();
            $table->string('password_hash');
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedBigInteger('successful_access_count')->default(0);
            $table->timestamp('last_accessed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('confidential_financial_files', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('confidential_financial_vault_id');
            $table->foreign('confidential_financial_vault_id', 'cf_files_vault_fk')
                ->references('id')->on('confidential_financial_vaults')->cascadeOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->string('original_name');
            $table->string('stored_path');
            $table->string('mime_type', 150);
            $table->unsignedBigInteger('file_size');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('confidential_financial_access_sessions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('confidential_financial_vault_id');
            $table->foreign('confidential_financial_vault_id', 'cf_sessions_vault_fk')
                ->references('id')->on('confidential_financial_vaults')->cascadeOnDelete();
            $table->char('token_hash', 64)->unique();
            $table->char('ip_hash', 64);
            $table->char('user_agent_hash', 64)->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });

        $now = now();
        DB::table('permissions')->updateOrInsert(
            ['code' => 'confidential_finance.manage'],
            [
                'module' => 'Confidential Finance',
                'action' => 'MANAGE',
                'description_key' => 'permissions.confidential_finance_manage.description',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        $deanRoleId = DB::table('roles')->where('code', 'DEAN')->value('id');
        $permissionId = DB::table('permissions')->where('code', 'confidential_finance.manage')->value('id');
        if ($deanRoleId && $permissionId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $deanRoleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('confidential_financial_access_sessions');
        Schema::dropIfExists('confidential_financial_files');
        Schema::dropIfExists('confidential_financial_vaults');
        DB::table('permissions')->where('code', 'confidential_finance.manage')->delete();
    }
};
