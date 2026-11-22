<?php
return [
    'permissions' => [
        'clinical_supervisors_view' => 'View hospitals and supervisor profiles',
        'clinical_supervisors_update' => 'Edit supervisor profile data',
        'supervisor_documents_view' => 'View and download professional documents',
        'supervisor_documents_upload' => 'Upload professional documents on behalf of a supervisor',
        'supervisor_documents_delete' => 'Delete professional documents',
        'supervisor_records_view' => 'View follow-up records, excuses and internal notes',
        'supervisor_records_create' => 'Record supervisor absences, notes, excuses and files',
        'supervisor_records_review' => 'Review, approve or reject supervisor excuses',
        'supervisor_records_delete' => 'Delete follow-up records with an audited reason',
    ],
    'document_saved' => 'Document uploaded.', 'document_deleted' => 'Document deleted.',
    'saved' => 'Record saved. Excuses have been submitted for review.',
    'reviewed' => 'Review decision recorded.', 'deleted' => 'Record removed; its audit history is retained.',
    'invalid_site' => 'The selected site is not linked to this supervisor.',
    'already_reviewed' => 'This excuse is no longer awaiting review. Refresh the list.',
    'self_review' => 'You cannot review your own excuse or a record you submitted. Another authorized reviewer must decide.',
];
