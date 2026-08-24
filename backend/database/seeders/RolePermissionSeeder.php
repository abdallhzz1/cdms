<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * ============================================================================
 * IMPORTANT — why this seeder grants far fewer permissions than the source
 * document's Role_Permission_Matrix sheet appears to describe.
 * ============================================================================
 *
 * Clinical_Department_Permission_Matrix_Workflows_v1.xlsx's
 * `Role_Permission_Matrix` sheet has 15 rows (one per module) and 8
 * unlabeled ✓/— columns plus a notes column — but there are 10 roles
 * (RoleSeeder.php), not 8, and the sheet has NO header row, NO legend, NO
 * cell comments, and NO defined names anywhere in the workbook that map
 * those 8 columns to specific roles (confirmed by inspecting the sheet's
 * merged cells, freeze panes, comments, and column widths — none exist —
 * and checking the workbook's README sheet, which has no legend either).
 * Re-verified directly against the uploaded source file for this phase
 * (Prompt 02 Task: "re-verify Role_Permission_Matrix column headers"); this
 * is not a re-run of a lossy earlier extraction.
 *
 * Prompt 02 §9 is explicit: "Do NOT create the complete permission matrix
 * from imagination... If it is not finalized, build the minimal necessary
 * foundation and clearly document the pending permissions." Guessing which
 * 8 of the 10 roles the columns represent (and in what order) would be
 * exactly the kind of invented business rule PROJECT_RULES.md forbids —
 * wrong in a way that would be invisible until the wrong person got (or was
 * denied) real access to a real student/grade/correspondence record.
 *
 * What IS unambiguous and seeded here: the Role_Permission_Matrix sheet's
 * own "Notes" column states outright, in prose, "System Admin only" for the
 * Users/Roles row and "System Admin + explicitly authorized leadership" for
 * the Audit row — consistent with the `Roles` sheet's SYS_ADMIN note ("No
 * academic approval by default...") and the `Role_Scope` sheet's SYS_ADMIN
 * row ("Can Manage: Users, roles, settings, technical maintenance"). These
 * four grants (users.manage, roles.manage, audit.view, settings.manage, all
 * scope_type 'global') are the minimum needed for a System Administrator to
 * bootstrap the system at all, and are not part of the ambiguous ✓ matrix
 * — they come from unambiguous prose repeated across three sheets.
 *
 * Every other role<->permission grant — including SYS_ADMIN's own access to
 * the 12 business-module rows (Students, Grades, Distribution, ...) — is
 * deliberately left unseeded pending clarification from the actual
 * spreadsheet author on the column order. This is flagged as a "Decision
 * Requiring Approval" in the Phase 2 report and should be added to
 * PROJECT_RULES.md's Open Decisions Register once acknowledged. It does not
 * block this phase: no business module exists yet for those permissions to
 * protect, so nothing is functionally missing today. It DOES block seeding
 * real grants in whichever phase builds the first business module — that
 * phase cannot proceed on this specific point without either (a) the
 * legend, or (b) an explicit decision to re-derive the matrix some other
 * way (e.g. from the raw Arabic source workbook, if it encodes the same
 * information more completely).
 */
class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $sysAdmin = Role::where('code', 'SYS_ADMIN')->firstOrFail();

        $bootstrapGrants = [
            'users.manage',
            'roles.manage',
            'audit.view',
            'settings.manage',
        ];

        foreach ($bootstrapGrants as $code) {
            $permission = Permission::where('code', $code)->firstOrFail();

            $sysAdmin->permissions()->syncWithoutDetaching([
                $permission->id => ['scope_type' => 'global'],
            ]);
        }

        $groupRegistrationGrants = Permission::where('code', 'like', 'group_registration.%')->get();
        foreach (Role::whereIn('code', ['SYS_ADMIN', 'ADMIN_ASSISTANT', 'CLINICAL_DIRECTOR'])->get() as $role) {
            foreach ($groupRegistrationGrants as $permission) {
                $role->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
            }
        }
    }
}
