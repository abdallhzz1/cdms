
<?php
use Illuminate\Support\Facades\Route;

Route::get('/test-corr', function() {
    \ = \App\Models\User::first();
    \ = \Illuminate\Http\Request::create('/api/v1/correspondence', 'POST', [
        'direction' => 'internal',
        'subject' => 'Test Subject',
        'summary' => 'Test Summary',
        'priority' => 'normal',
        'correspondence_date' => '2026-08-17',
        'assigned_to' => 1
    ]);
    \->headers->set('Accept', 'application/json');
    \->setUserResolver(function() use (\) { return \; });

    try {
        \ = app()->make(\App\Http\Controllers\Api\V1\CorrespondenceController::class);
        \ = app()->make(\App\Services\WorkflowTransitionService::class);
        \ = \->store(\, \);
        return \;
    } catch (\Illuminate\Validation\ValidationException \) {
        return response()->json(\->errors(), 422);
    } catch (\Exception \) {
        return \->getMessage();
    }
});

