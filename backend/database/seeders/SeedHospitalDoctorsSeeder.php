<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Person;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;

class SeedHospitalDoctorsSeeder extends Seeder
{
    public function run(): void
    {
        $supRole = Role::firstOrCreate(
            ['code' => 'CLINICAL_SUPERVISOR'],
            ['name_ar' => 'مشرف سريري', 'name_en' => 'Clinical Supervisor']
        );

        // 1. Unlink & Clean old supervisor users
        $usersToDelete = User::whereHas('roles', function ($q) {
            $q->where('code', 'CLINICAL_SUPERVISOR');
        })->whereDoesntHave('roles', function ($q) {
            $q->where('code', '!=', 'CLINICAL_SUPERVISOR');
        })->get();

        foreach ($usersToDelete as $u) {
            $u->roles()->detach();
            Person::where('user_id', $u->id)->update(['user_id' => null]);
            $u->delete();
        }

        // 2. Hospital Doctors Directory
        $hospitalData = [
            'م. الأهلي' => [
                ['ar' => 'د. عبد الله قاسم', 'en' => 'Dr. Abdallah Qasim', 'email' => 'abdallah.qasim@hebron.edu'],
                ['ar' => 'د. بدوي انداعور', 'en' => 'Dr. Badawi Indaour', 'email' => 'badawi.indaour@hebron.edu'],
                ['ar' => 'د. حسن الحروب', 'en' => 'Dr. Hassan Haroub', 'email' => 'hassan.haroub@hebron.edu'],
                ['ar' => 'د. رواد عارضة', 'en' => 'Dr. Rawad Arda', 'email' => 'rawad.arda@hebron.edu'],
                ['ar' => 'د. أنس أبو رميلة', 'en' => 'Dr. Anas Abu Rmeileh', 'email' => 'anas.rmeileh@hebron.edu'],
                ['ar' => 'د. صفوت زيدات', 'en' => 'Dr. Safwat Zeidat', 'email' => 'safwat.zeidat@hebron.edu'],
                ['ar' => 'د. أحمد العطاونة', 'en' => 'Dr. Ahmad Atawneh', 'email' => 'ahmad.atawneh@hebron.edu'],
                ['ar' => 'د. محمود الهور', 'en' => 'Dr. Mahmoud Al-Hoor', 'email' => 'mahmoud.hoor@hebron.edu'],
                ['ar' => 'د. بسام البشيتي', 'en' => 'Dr. Bassam Bsheiti', 'email' => 'bassam.bsheiti@hebron.edu'],
                ['ar' => 'د. فوزي ابونجمة', 'en' => 'Dr. Fawzi Abu Najmeh', 'email' => 'fawzi.najmeh@hebron.edu'],
                ['ar' => 'د. علي أبورميش', 'en' => 'Dr. Ali Abu Rmeish', 'email' => 'ali.rmeish@hebron.edu'],
                ['ar' => 'د. تامر قطينة', 'en' => 'Dr. Tamer Qteineh', 'email' => 'tamer.qteineh@hebron.edu'],
                ['ar' => 'د. نور الهدى صوالحة', 'en' => 'Dr. Nour Al-Huda Sawalha', 'email' => 'nour.sawalha@hebron.edu'],
                ['ar' => 'د. عامر ابو رميلة', 'en' => 'Dr. Amer Abu Rmeileh', 'email' => 'amer.rmeileh@hebron.edu'],
                ['ar' => 'د. احمد ابو يوسف', 'en' => 'Dr. Ahmad Abu Yousef', 'email' => 'ahmad.yousef@hebron.edu'],
                ['ar' => 'د. مراد النتشة', 'en' => 'Dr. Murad Natsheh', 'email' => 'murad.natsheh@hebron.edu'],
                ['ar' => 'د. ضرار الزعتري', 'en' => 'Dr. Derar Zaatari', 'email' => 'derar.zaatari@hebron.edu'],
                ['ar' => 'د. عصام شماس', 'en' => 'Dr. Issam Shammas', 'email' => 'issam.shammas@hebron.edu'],
                ['ar' => 'د. انس شاور', 'en' => 'Dr. Anas Shawar', 'email' => 'anas.shawar@hebron.edu'],
                ['ar' => 'د. نزار حجة', 'en' => 'Dr. Nizar Hijjeh', 'email' => 'nizar.hijjeh@hebron.edu'],
                ['ar' => 'د. رشاد الزرو', 'en' => 'Dr. Rashad Zaro', 'email' => 'rashad.zaro@hebron.edu'],
                ['ar' => 'د. بسام ناصر الدين', 'en' => 'Dr. Bassam Naser Al-Din', 'email' => 'bassam.din@hebron.edu'],
                ['ar' => 'د. ضرار سميرات', 'en' => 'Dr. Derar Smeirat', 'email' => 'derar.smeirat@hebron.edu'],
                ['ar' => 'د. ممدوح دريدي', 'en' => 'Dr. Mamdouh Draidi', 'email' => 'mamdouh.draidi@hebron.edu'],
            ],
            'م. الهلال' => [
                ['ar' => 'د. محمد زهور', 'en' => 'Dr. Mohammad Zhour', 'email' => 'mohammad.zhour@hebron.edu'],
                ['ar' => 'د. طلب العجلوني', 'en' => 'Dr. Talab Ajlouni', 'email' => 'talab.ajlouni@hebron.edu'],
                ['ar' => 'د. رضوان ابو كرش', 'en' => 'Dr. Radwan Abu Karsh', 'email' => 'radwan.karsh@hebron.edu'],
                ['ar' => 'د. شريف حسان', 'en' => 'Dr. Sharif Hassan', 'email' => 'sharif.hassan@hebron.edu'],
                ['ar' => 'د. احمد ابوشرخ', 'en' => 'Dr. Ahmad Abu Sharakh', 'email' => 'ahmad.sharakh@hebron.edu'],
                ['ar' => 'د. سلامة المحتسب', 'en' => 'Dr. Salameh Muhtaseb', 'email' => 'salameh.muhtaseb@hebron.edu'],
                ['ar' => 'د. محمود قديمات', 'en' => 'Dr. Mahmoud Qdeimat', 'email' => 'mahmoud.qdeimat@hebron.edu'],
                ['ar' => 'د. عمار الحداد', 'en' => 'Dr. Ammar Haddad', 'email' => 'ammar.haddad@hebron.edu'],
                ['ar' => 'د. عبيدالله ابو سنينة', 'en' => 'Dr. Obaidallah Abu Sneineh', 'email' => 'obaidallah.sneineh@hebron.edu'],
                ['ar' => 'د. تامر شاور', 'en' => 'Dr. Tamer Shawar', 'email' => 'tamer.shawar@hebron.edu'],
                ['ar' => 'د. خليل ابو زينة', 'en' => 'Dr. Khalil Abu Zeina', 'email' => 'khalil.zeina@hebron.edu'],
                ['ar' => 'د. اسماعيل ارزيقات', 'en' => 'Dr. Ismail Rzeigat', 'email' => 'ismail.rzeigat@hebron.edu'],
                ['ar' => 'د. الاء عباس', 'en' => 'Dr. Alaa Abbas', 'email' => 'alaa.abbas@hebron.edu'],
                ['ar' => 'د. عبد السلام حداد', 'en' => 'Dr. Abdulsalam Haddad', 'email' => 'abdulsalam.haddad@hebron.edu'],
            ],
            'م. عالية' => [
                ['ar' => 'د. اشرف افغانة', 'en' => 'Dr. Ashraf Afghaneh', 'email' => 'ashraf.afghaneh@hebron.edu'],
                ['ar' => 'د. عمر عليان', 'en' => 'Dr. Omar Olayan', 'email' => 'omar.olayan@hebron.edu'],
                ['ar' => 'د. مهند ابوساكور', 'en' => 'Dr. Mohannad Abu Sakour', 'email' => 'mohannad.sakour@hebron.edu'],
                ['ar' => 'د. وائل الجعبري', 'en' => 'Dr. Wael Jaabari', 'email' => 'wael.jaabari@hebron.edu'],
                ['ar' => 'د. عبد الناصر الجنيدي', 'en' => 'Dr. Abd Al-Nasser Junaidi', 'email' => 'abdnasser.junaidi@hebron.edu'],
                ['ar' => 'د. اياد الجدع', 'en' => 'Dr. Iyad Jadaa', 'email' => 'iyad.jadaa@hebron.edu'],
                ['ar' => 'د. معتصم ادعيس', 'en' => 'Dr. Moatasem Ideis', 'email' => 'moatasem.ideis@hebron.edu'],
                ['ar' => 'د. رائد شواورة', 'en' => 'Dr. Raed Shawawreh', 'email' => 'raed.shawawreh@hebron.edu'],
                ['ar' => 'د. زياد رمضان', 'en' => 'Dr. Ziad Ramadan', 'email' => 'ziad.ramadan@hebron.edu'],
                ['ar' => 'د. قيصر عوض', 'en' => 'Dr. Qaisar Awad', 'email' => 'qaisar.awad@hebron.edu'],
                ['ar' => 'د. محمد الرجبي', 'en' => 'Dr. Mohammad Rajabi', 'email' => 'mohammad.rajabi@hebron.edu'],
                ['ar' => 'د. يوسف الحروب', 'en' => 'Dr. Yousef Haroub', 'email' => 'yousef.haroub@hebron.edu'],
                ['ar' => 'د. سعيد الزعتري', 'en' => 'Dr. Saeed Zaatari', 'email' => 'saeed.zaatari@hebron.edu'],
                ['ar' => 'د. هشام ابو رميلة', 'en' => 'Dr. Hisham Abu Rmeileh', 'email' => 'hisham.rmeileh@hebron.edu'],
            ],
            'م. دورا' => [
                ['ar' => 'د. صابرين رجوب', 'en' => 'Dr. Sabreen Rjoub', 'email' => 'sabreen.rjoub@hebron.edu'],
                ['ar' => 'د. حمزة الزهور', 'en' => 'Dr. Hamza Zhour', 'email' => 'hamzag@hebron.edu'],
            ],
            'م. بيت جالا' => [
                ['ar' => 'د. زيدان زيدان', 'en' => 'Dr. Zeidan Zeidan', 'email' => 'zeidan.zeidan@hebron.edu'],
                ['ar' => 'د. رامي العيسة', 'en' => 'Dr. Rami Aissa', 'email' => 'rami.aissa@hebron.edu'],
                ['ar' => 'د. مجد حميدة', 'en' => 'Dr. Majd Hmeideh', 'email' => 'majd.hmeideh@hebron.edu'],
                ['ar' => 'د. اسامة كرجة', 'en' => 'Dr. Osama Karjeh', 'email' => 'osama.karjeh@hebron.edu'],
                ['ar' => 'د. عمار شاهين', 'en' => 'Dr. Ammar Shaheen', 'email' => 'ammar.shaheen@hebron.edu'],
            ],
            'م. كاريتاس' => [
                ['ar' => 'د. هيام مرزوقة', 'en' => 'Dr. Hiyam Marzouqa', 'email' => 'hiyam.marzouqa@hebron.edu'],
            ],
            'م. العائلة المقدسة' => [
                ['ar' => 'د. تامر مصلح', 'en' => 'Dr. Tamer Musleh', 'email' => 'tamer.musleh@hebron.edu'],
                ['ar' => 'د. بشار رشماوي', 'en' => 'Dr. Bashar Rashmawi', 'email' => 'bashar.rashmawi@hebron.edu'],
            ],
            'م. محمود عباس' => [
                ['ar' => 'د. رواد ابو ريان', 'en' => 'Dr. Rawad Abu Rayyan', 'email' => 'rawad.rayyan@hebron.edu'],
                ['ar' => 'د. سامي سويطي', 'en' => 'Dr. Sami Sweiti', 'email' => 'sami.sweiti@hebron.edu'],
            ],
            'م. يطا' => [
                ['ar' => 'د. نضال بحيص', 'en' => 'Dr. Nidal Buhais', 'email' => 'nidal.buhais@hebron.edu'],
            ]
        ];

        foreach ($hospitalData as $hospName => $docs) {
            foreach ($docs as $doc) {
                $user = User::where('email', $doc['email'])->first();
                if (!$user) {
                    $user = User::create([
                        'name'      => $doc['ar'],
                        'email'     => $doc['email'],
                        'password'  => Hash::make('password123'),
                        'is_active' => true,
                    ]);
                }
                $user->roles()->syncWithoutDetaching([$supRole->id]);

                $person = Person::where('email', $doc['email'])->first();
                if (!$person) {
                    $person = Person::create([
                        'user_id'       => $user->id,
                        'full_name_ar'  => $doc['ar'],
                        'full_name_en'  => $doc['en'],
                        'email'         => $doc['email'],
                        'notes'         => $hospName,
                        'is_active'     => true,
                    ]);
                } else {
                    $person->user_id = $user->id;
                    $person->notes = $hospName;
                    $person->save();
                }
            }
        }
    }
}
