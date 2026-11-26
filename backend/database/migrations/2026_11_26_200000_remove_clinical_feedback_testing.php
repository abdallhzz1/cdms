<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // These tables contain disposable staff tests, never real student responses.
        Schema::dropIfExists('clinical_feedback_test_answers');
        Schema::dropIfExists('clinical_feedback_test_runs');
        // Both role and individual grants cascade through their permission foreign keys.
        DB::table('permissions')->whereIn('code', ['clinical_feedback.test', 'clinical_feedback.delete_test'])->delete();
    }

    public function down(): void
    {
        throw new RuntimeException('Retired staff testing data and access cannot be restored by rollback.');
    }
};
