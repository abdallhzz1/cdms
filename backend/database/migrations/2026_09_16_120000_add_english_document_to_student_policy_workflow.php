<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('student_policy_documents', function (Blueprint $table) {
            $table->string('storage_path_en')->nullable()->after('sha256');
            $table->string('original_name_en')->nullable()->after('storage_path_en');
            $table->string('mime_type_en', 100)->nullable()->after('original_name_en');
            $table->unsignedBigInteger('size_bytes_en')->nullable()->after('mime_type_en');
            $table->char('sha256_en', 64)->nullable()->after('size_bytes_en');
        });

        Schema::table('student_policy_assignments', function (Blueprint $table) {
            $table->timestamp('opened_ar_at')->nullable()->after('opened_at');
            $table->timestamp('opened_en_at')->nullable()->after('opened_ar_at');
            $table->char('acknowledged_document_sha256_en', 64)->nullable()->after('acknowledged_document_sha256');
        });
    }

    public function down(): void
    {
        Schema::table('student_policy_assignments', function (Blueprint $table) {
            $table->dropColumn(['opened_ar_at', 'opened_en_at', 'acknowledged_document_sha256_en']);
        });
        Schema::table('student_policy_documents', function (Blueprint $table) {
            $table->dropColumn(['storage_path_en', 'original_name_en', 'mime_type_en', 'size_bytes_en', 'sha256_en']);
        });
    }
};
