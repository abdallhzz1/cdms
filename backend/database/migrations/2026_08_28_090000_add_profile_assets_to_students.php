<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            if (! Schema::hasColumn('students', 'photo_storage_path')) {
                $table->string('photo_storage_path')->nullable()->after('photo_url');
            }
            if (! Schema::hasColumn('students', 'documents')) {
                $table->json('documents')->nullable()->after('notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            if (Schema::hasColumn('students', 'documents')) {
                $table->dropColumn('documents');
            }
            if (Schema::hasColumn('students', 'photo_storage_path')) {
                $table->dropColumn('photo_storage_path');
            }
        });
    }
};
