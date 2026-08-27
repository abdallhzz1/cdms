<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_warning_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->foreignId('rotation_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('academic_year_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('course_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('threshold_percent');
            $table->unsignedSmallInteger('absent_days');
            $table->unsignedSmallInteger('total_required_days');
            $table->decimal('absence_percentage', 6, 2);
            $table->string('recipient_email');
            $table->string('delivery_status', 20)->default('sending');
            $table->string('failure_code')->nullable();
            $table->foreignId('sent_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['student_id', 'rotation_id', 'threshold_percent'], 'attendance_warning_lookup');
            $table->index(['delivery_status', 'sent_at'], 'attendance_warning_delivery');
        });

        DB::table('permissions')->updateOrInsert(
            ['code' => 'attendance.notify'],
            [
                'module' => 'Attendance',
                'action' => 'NOTIFY',
                'description_key' => 'permissions.attendance_notify.description',
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_warning_notifications');

        $permissionId = DB::table('permissions')->where('code', 'attendance.notify')->value('id');
        if ($permissionId && ! DB::table('role_permissions')->where('permission_id', $permissionId)->exists()) {
            DB::table('permissions')->where('id', $permissionId)->delete();
        }
    }
};
