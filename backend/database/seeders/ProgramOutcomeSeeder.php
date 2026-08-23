<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\ProgramOutcome;

class ProgramOutcomeSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $plos = [
            [
                'code' => 'PLO1',
                'name_en' => 'Basic Medical Knowledge & Skills',
                'name_ar' => 'المعرفة والمهارات الطبية الأساسية',
                'description_en' => 'Gain knowledge at the basic medical sciences levels and demonstrate competency in human body structure, function, and pathology.',
                'description_ar' => 'اكتساب معرفة شاملة ودقيقة عن بنية وظيفة جسم الإنسان في حالات الصحة والمرض، وفهم الآليات الفسيولوجية والمرضية.',
                'domain' => 'Knowledge & Skills'
            ],
            [
                'code' => 'PLO2',
                'name_en' => 'Health Informatics & Technology',
                'name_ar' => 'المعلوماتية الصحية والتكنولوجيا',
                'description_en' => 'Main principles of bioinformatics, Information and Communication Technology (ICT), Artificial Intelligence, electronic patient profiles and digital documentation.',
                'description_ar' => 'تطوير قدرات الطلاب في استخدام التكنولوجيا الحديثة، المحاكاة الافتراضية، والذكاء الاصطناعي في التعليم والممارسة الطبية.',
                'domain' => 'Knowledge & Skills'
            ],
            [
                'code' => 'PLO3',
                'name_en' => 'Transferable Skills',
                'name_ar' => 'المهارات القابلة للنقل',
                'description_en' => 'Emphasize certain transferable skills and basic knowledge outcomes as pertinent for every course in basic medical sciences.',
                'description_ar' => 'القدرة على اكتساب المعرفة والمهارات الأساسية اللازمة وتطبيقها ودمجها في الممارسة الطبية.',
                'domain' => 'Knowledge & Skills'
            ],
            [
                'code' => 'PLO4',
                'name_en' => 'Patient Evaluation & Clinical Diagnosis',
                'name_ar' => 'تقييم المريض والتشخيص السريري',
                'description_en' => 'To obtain authentic information about patients and their conditions and present it effectively through history taking and physical examination.',
                'description_ar' => 'القدرة على الحصول على معلومات دقيقة وموثوقة عن المرضى، وإجراء فحص سريري شامل لتشخيص الحالات المرضية بدقة.',
                'domain' => 'Knowledge & Skills'
            ],
            [
                'code' => 'PLO5',
                'name_en' => 'Professional Ethics & Attitude',
                'name_ar' => 'الأخلاقيات والسلوك المهني',
                'description_en' => 'Demonstrate sensitivity, ethical behavior, and professionalism with patients, respecting the patient\'s privacy and autonomy.',
                'description_ar' => 'إظهار السلوك المهني والأخلاقي والكفاءة في التعامل مع المرضى مع احترام العوامل الاجتماعية والثقافية.',
                'domain' => 'Professional Ethics & Attitude'
            ],
            [
                'code' => 'PLO6',
                'name_en' => 'Continuous Education & Life-long Learning',
                'name_ar' => 'التعليم المستمر والتعلم مدى الحياة',
                'description_en' => 'Involve in continuous education and life-long learning after graduation by adapting the skills needed for self-development.',
                'description_ar' => 'الانخراط في التعليم المستمر والتعلم مدى الحياة لضمان تحسين الجودة وتطوير الأداء الأكاديمي والمهني.',
                'domain' => 'Professional Ethics & Attitude'
            ],
            [
                'code' => 'PLO7',
                'name_en' => 'Epidemiology & Public Health',
                'name_ar' => 'علم الأوبئة والصحة العامة',
                'description_en' => 'Apply principles of epidemiology, biostatistics, and public health on communicable and non-communicable diseases.',
                'description_ar' => 'تطبيق مبادئ علم الأوبئة، الإحصاء الحيوي، والصحة العامة للحد من الأمراض وتقييم العوامل الاجتماعية والاقتصادية.',
                'domain' => 'Community & Public Health'
            ],
            [
                'code' => 'PLO8',
                'name_en' => 'Health Promotion & Leadership',
                'name_ar' => 'تعزيز الصحة والقيادة',
                'description_en' => 'Demonstrate an understanding of the basic issues of health promotion, wellness, medical care, teamwork, and leadership.',
                'description_ar' => 'إظهار فهم دقيق للقضايا الأساسية المتعلقة بتعزيز الصحة، الرعاية الطبية، العمل الجماعي، وإدارة الرعاية الصحية.',
                'domain' => 'Community & Public Health'
            ],
            [
                'code' => 'PLO9',
                'name_en' => 'Healthcare Resources Utilization',
                'name_ar' => 'استخدام موارد الرعاية الصحية',
                'description_en' => 'Demonstrate the ability to call effectively on other resources in the systems available to provide optimal healthcare.',
                'description_ar' => 'إظهار القدرة على استخدام الموارد والأنظمة الفعالة في تقديم الرعاية الصحية عالية الجودة.',
                'domain' => 'Community & Public Health'
            ],
            [
                'code' => 'PLO10',
                'name_en' => 'Biomedical Information Management',
                'name_ar' => 'إدارة المعلومات الطبية الحيوية',
                'description_en' => 'Demonstrate the ability to manage and utilize biomedical information for problems solving and decisions making.',
                'description_ar' => 'إظهار القدرة على إدارة واستخدام المعلومات الطبية الحيوية لحل المشكلات واتخاذ القرارات السريرية.',
                'domain' => 'Research & Evidence Based Practices'
            ],
            [
                'code' => 'PLO11',
                'name_en' => 'Evidence-Based Medicine (EBM)',
                'name_ar' => 'الطب المبني على الأدلة',
                'description_en' => 'Learn, understand and apply the basic principles of scientific methods in medical research.',
                'description_ar' => 'فهم وتطبيق مبادئ الطب المبني على الأدلة، وتحليل البيانات واستخدام قواعد البيانات الطبية الموثوقة.',
                'domain' => 'Research & Evidence Based Practices'
            ],
            [
                'code' => 'PLO12',
                'name_en' => 'Medical Research & Ethics',
                'name_ar' => 'البحث الطبي والأخلاقيات',
                'description_en' => 'Be able to conduct research in accordance with the known ethical principles utilizing proper research methods.',
                'description_ar' => 'إجراء البحوث الطبية بما يتوافق مع المبادئ الأخلاقية واستخدام أساليب البحث العلمي المعتمدة.',
                'domain' => 'Research & Evidence Based Practices'
            ],
            [
                'code' => 'PLO13',
                'name_en' => 'Communication Skills',
                'name_ar' => 'مهارات التواصل',
                'description_en' => 'Demonstrate effective verbal and nonverbal communication skills with patients, their families, and colleagues.',
                'description_ar' => 'إظهار مهارات تواصل لفظية وغير لفظية فعالة مع المرضى، عائلاتهم، والزملاء في المجال الصحي.',
                'domain' => 'Communication'
            ],
            [
                'code' => 'PLO14',
                'name_en' => 'Inter-professional Collaboration',
                'name_ar' => 'التعاون المهني المشترك',
                'description_en' => 'Collaborate effectively in various healthcare delivery settings and with inter-professional teams to enhance patient safety.',
                'description_ar' => 'التعاون الفعال مع فرق الرعاية الصحية المتعددة التخصصات لتعزيز سلامة المرضى وتقديم رعاية شاملة.',
                'domain' => 'Communication'
            ]
        ];

        foreach ($plos as $plo) {
            ProgramOutcome::updateOrCreate(
                ['code' => $plo['code']],
                $plo
            );
        }
    }
}
