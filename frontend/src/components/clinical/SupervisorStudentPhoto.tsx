import { ProfilePhotoLightbox } from '@/components/ui/ProfilePhotoLightbox';
import { studentName, type Student } from '@/pages/clinical/supervisorWorkspace';

export function SupervisorStudentPhoto({ student, ar }: { student: Student; ar: boolean }) {
  const name = studentName(student, ar);
  return <ProfilePhotoLightbox photoUrl={student.photo_url} name={name} subtitle={student.university_number} enlargeLabel={ar ? 'تكبير صورة الطالب' : 'Enlarge student photo'} />;
}
