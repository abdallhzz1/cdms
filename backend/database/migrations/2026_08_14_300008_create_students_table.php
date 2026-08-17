<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up() {
        Schema::create('students', function (Blueprint $table) {
            $table->id();
            $table->string('university_number')->unique();
            $table->string('full_name_ar');
            $table->string('full_name_en')->nullable();
            $table->string('national_id')->nullable();
            $table->string('gender')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('city')->nullable();
            $table->string('phone')->nullable();
            $table->string('guardian_phone')->nullable();
            $table->string('university_email')->nullable();
            $table->string('photo_url')->nullable();
            $table->integer('batch_year')->nullable();
            $table->string('academic_level')->nullable();
            $table->foreignId('academic_year_id')->nullable()->constrained('academic_years')->nullOnDelete();
            $table->string('study_plan_code')->nullable();
            $table->string('registration_status')->default('active');
            $table->decimal('gpa', 5, 2)->nullable();
            $table->integer('credit_hours_passed')->nullable();
            $table->integer('warning_count')->default(0);
            $table->date('last_warning_date')->nullable();
            $table->foreignId('academic_advisor_id')->nullable()->constrained('people')->nullOnDelete();
            $table->string('clinical_fees_status')->default('unpaid');
            $table->boolean('has_amboss_subscription')->default(false);
            $table->text('notes')->nullable();
            $table->string('data_source')->nullable();
            $table->timestamps();
        });
    }
    public function down() { Schema::dropIfExists('students'); }
};
