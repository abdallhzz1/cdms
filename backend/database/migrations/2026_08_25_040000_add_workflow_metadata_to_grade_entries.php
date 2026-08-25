<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('grade_entries', function (Blueprint $table) {
            $table->foreignId('prepared_by_user_id')->nullable()->after('status')->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable()->after('prepared_by_user_id');
            $table->foreignId('approved_by_user_id')->nullable()->after('submitted_at')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by_user_id');
            $table->text('return_reason')->nullable()->after('approved_at');
        });
    }

    public function down(): void
    {
        Schema::table('grade_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('approved_by_user_id');
            $table->dropConstrainedForeignId('prepared_by_user_id');
            $table->dropColumn(['submitted_at', 'approved_at', 'return_reason']);
        });
    }
};
