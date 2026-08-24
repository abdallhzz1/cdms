<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $roleIds=DB::table('roles')->whereIn('code',['SYS_ADMIN','ADMIN_ASSISTANT','CLINICAL_DIRECTOR'])->pluck('id');
        $permissionIds=DB::table('permissions')->where('code','like','group_registration.%')->pluck('id');
        foreach($roleIds as $roleId) foreach($permissionIds as $permissionId) DB::table('role_permissions')->updateOrInsert(
            ['role_id'=>$roleId,'permission_id'=>$permissionId],
            ['scope_type'=>'global','created_at'=>now(),'updated_at'=>now()]
        );
    }
    public function down(): void {}
};
