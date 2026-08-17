<?php
use Illuminate\Database\Migrations\Migration; use Illuminate\Database\Schema\Blueprint; use Illuminate\Support\Facades\Schema;
return new class extends Migration { public function up(): void { Schema::table('external_electives', function (Blueprint $table) { $table->string('external_evaluation')->nullable()->after('student_report'); $table->decimal('score', 8, 2)->nullable()->after('external_evaluation'); }); } public function down(): void { Schema::table('external_electives', function (Blueprint $table) { $table->dropColumn(['external_evaluation', 'score']); }); } };
