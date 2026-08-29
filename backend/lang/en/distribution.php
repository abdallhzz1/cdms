<?php

return [
    'approval' => [
        'invalid_status' => 'Only a distribution that is still being prepared can be approved.',
        'forbidden' => 'You do not have permission to approve this distribution.',
        'unassigned' => 'Some eligible students have not been assigned yet.',
        'override_reason_required' => 'Enter a reason to approve while students remain unassigned.',
        'override_forbidden' => 'You do not have permission to override unassigned students.',
        'required_for_publish' => 'This schedule is not currently approved. Approve it again after completing the latest changes, then publish it.',
        'success' => 'The distribution schedule was approved successfully and is ready to publish.',
    ],
    'publication' => [
        'invalid_status' => 'Only a distribution that is still being prepared can be published.',
        'forbidden' => 'You do not have permission to publish this distribution.',
        'unassigned' => 'Some eligible students have not been assigned yet.',
        'override_reason_required' => 'Enter a reason to publish while students remain unassigned.',
        'override_forbidden' => 'You do not have permission to override unassigned students.',
        'success' => 'The distribution schedule was published successfully.',
    ],
    'constraints' => [
        'override_reason_required' => 'Enter a reason to bypass the detected constraints.',
        'override_forbidden' => 'You do not have permission to bypass the detected constraints.',
    ],
];
