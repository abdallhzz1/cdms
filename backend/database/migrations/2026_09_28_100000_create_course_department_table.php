<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_department', function (Blueprint $table) {
            $table->foreignId('course_id')->constrained()->restrictOnDelete();
            $table->foreignId('department_id')->constrained()->restrictOnDelete();
            $table->primary(['course_id', 'department_id'], 'course_dept_pk');
            $table->index('department_id', 'course_dept_dept_idx');
        });

        // Authoritative ownership: reference workbook, sheet 16, column H.
        // College/clinical-directorate courses deliberately have no department
        // owner. N1471 is the catalog's renamed counterpart of source M1471.
        $owners = [
            'M1460' => 'DEP-IM', 'M1661' => 'DEP-IM', 'M1662' => 'DEP-IM', 'M1687' => 'DEP-IM',
            'M1470' => 'DEP-GS', 'M1673' => 'DEP-GS',
            'M1583' => 'DEP-PED', 'M1688' => 'DEP-PED',
            'M1582' => 'DEP-OBG', 'M1689' => 'DEP-OBG',
            'M1481' => 'DEP-IMS', 'M1461' => 'DEP-IMS', 'M1462' => 'DEP-IMS',
            'M1471' => 'DEP-IMS', 'N1471' => 'DEP-IMS', 'M1563' => 'DEP-IMS',
            'M1574' => 'DEP-SSS', 'M1566' => 'DEP-SSS', 'M1571' => 'DEP-SSS',
            'M1572' => 'DEP-SSS', 'M1677' => 'DEP-SSS',
            'M1593' => 'DEP-FCM',
        ];
        $departments = DB::table('departments')->pluck('id', 'code');
        foreach (DB::table('courses')->get(['id', 'code']) as $course) {
            $departmentId = $departments[$owners[strtoupper(trim($course->code))] ?? ''] ?? null;
            if ($departmentId) {
                DB::table('course_department')->insertOrIgnore([
                    'course_id' => $course->id, 'department_id' => $departmentId,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('course_department');
    }
};
