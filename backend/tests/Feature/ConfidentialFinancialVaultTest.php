<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ConfidentialFinancialVaultTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost');
        Storage::fake('local');
    }

    public function test_password_protects_public_metadata_and_private_file(): void
    {
        $manager = $this->userWithPermission();
        $created = $this->actingAs($manager, 'web')->postJson('/api/v1/confidential-financial-vaults', [
            'title' => 'Dean confidential finance file',
            'description' => 'Restricted content',
            'password' => 'StrongSecret2026!',
            'password_confirmation' => 'StrongSecret2026!',
        ])->assertCreated()
            ->assertJsonMissingPath('data.password_hash');

        $vaultId = $created->json('data.id');
        $publicPath = $created->json('data.public_path');
        $token = basename($publicPath);
        $publicApi = "/api/v1/public/confidential-financial-vaults/{$token}";
        $this->assertNotSame($token, DB::table('confidential_financial_vaults')->where('id', $vaultId)->value('share_token'));

        $upload = $this->post("/api/v1/confidential-financial-vaults/{$vaultId}/files", [
            'files' => [UploadedFile::fake()->image('financial-report.png')],
        ])->assertCreated();
        $fileId = $upload->json('data.0.id');

        $this->getJson($publicApi)->assertOk()
            ->assertJsonPath('data.unlocked', false)
            ->assertJsonMissingPath('data.vault');
        $this->get("{$publicApi}/files/{$fileId}")->assertForbidden();
        $this->postJson("{$publicApi}/unlock", ['password' => 'wrong-password'])->assertUnprocessable();

        $unlock = $this->postJson("{$publicApi}/unlock", ['password' => 'StrongSecret2026!'])
            ->assertOk()
            ->assertJsonPath('data.unlocked', true)
            ->assertJsonPath('data.vault.title', 'Dean confidential finance file');
        $cookieName = 'cdms_financial_vault_'.$vaultId;
        $accessToken = $unlock->getCookie($cookieName)?->getValue();
        $this->assertIsString($accessToken);

        $this->withCredentials()->withCookie($cookieName, $accessToken)
            ->get("{$publicApi}/files/{$fileId}")
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_qr_link_is_permanent_while_access_can_be_disabled_and_password_changed(): void
    {
        $manager = $this->userWithPermission();
        $created = $this->actingAs($manager, 'web')->postJson('/api/v1/confidential-financial-vaults', [
            'title' => 'Permanent QR vault',
            'password' => 'OriginalSecret2026!',
            'password_confirmation' => 'OriginalSecret2026!',
        ])->assertCreated();
        $vaultId = $created->json('data.id');
        $publicPath = $created->json('data.public_path');
        $publicApi = '/api/v1/public'.str_replace('/secure/financial-documents', '/confidential-financial-vaults', $publicPath);

        $firstUnlock = $this->postJson("{$publicApi}/unlock", ['password' => 'OriginalSecret2026!'])->assertOk();
        $cookieName = 'cdms_financial_vault_'.$vaultId;
        $oldAccessToken = $firstUnlock->getCookie($cookieName)?->getValue();
        $this->assertIsString($oldAccessToken);

        $this->putJson("/api/v1/confidential-financial-vaults/{$vaultId}", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('data.public_path', $publicPath);
        $this->getJson($publicApi)->assertNotFound();

        $this->putJson("/api/v1/confidential-financial-vaults/{$vaultId}", [
            'is_active' => true,
            'password' => 'ReplacementSecret2026!',
            'password_confirmation' => 'ReplacementSecret2026!',
        ])->assertOk()
            ->assertJsonPath('data.public_path', $publicPath);

        $this->withCredentials()->withCookie($cookieName, $oldAccessToken)
            ->getJson($publicApi)
            ->assertOk()
            ->assertJsonPath('data.unlocked', false);
        $this->postJson("{$publicApi}/unlock", ['password' => 'OriginalSecret2026!'])->assertUnprocessable();
        $this->postJson("{$publicApi}/unlock", ['password' => 'ReplacementSecret2026!'])->assertOk();
    }

    public function test_management_requires_the_confidential_finance_permission(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'web')->getJson('/api/v1/confidential-financial-vaults')->assertForbidden();
    }

    private function userWithPermission(): User
    {
        $role = Role::factory()->create();
        $permission = Permission::firstOrCreate(['code' => 'confidential_finance.manage'], [
            'module' => 'Confidential Finance',
            'action' => 'MANAGE',
            'description_key' => 'permissions.confidential_finance_manage.description',
        ]);
        $role->permissions()->attach($permission->id, ['scope_type' => 'global']);
        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        return $user;
    }
}
