<?php
return [
    'permissions' => [
        'clinical_supervisors_view' => 'عرض المستشفيات وبروفايلات المشرفين',
        'clinical_supervisors_update' => 'تعديل بيانات بروفايل المشرف',
        'supervisor_documents_view' => 'عرض وتنزيل الوثائق المهنية',
        'supervisor_documents_upload' => 'رفع وثائق مهنية بالنيابة عن المشرف',
        'supervisor_documents_delete' => 'حذف الوثائق المهنية',
        'supervisor_records_view' => 'عرض المتابعة والأعذار والملاحظات الداخلية',
        'supervisor_records_create' => 'تسجيل غياب أو ملاحظة أو عذر وملف للمشرف',
        'supervisor_records_review' => 'مراجعة أعذار المشرفين وقبولها أو رفضها',
        'supervisor_records_delete' => 'حذف سجل متابعة مع توثيق السبب',
    ],
    'document_saved' => 'تم رفع الوثيقة.', 'document_deleted' => 'تم حذف الوثيقة.',
    'saved' => 'تم حفظ السجل وإرسال العذر للمراجعة إن وُجد.',
    'reviewed' => 'تم تسجيل قرار المراجعة.', 'deleted' => 'تم حذف السجل مع حفظ تاريخ الإجراء.',
    'invalid_site' => 'الموقع المحدد غير مرتبط بهذا المشرف.',
    'already_reviewed' => 'العذر ليس قيد المراجعة. حدّث القائمة للاطلاع على حالته.',
    'self_review' => 'لا يمكنك مراجعة عذر يخصك أو سجل قمت بإرساله. يجب أن يراجعه مستخدم آخر مخول.',
];
