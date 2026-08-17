import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { FoundationHome } from '@/pages/FoundationHome';
import { LoginPage } from '@/pages/LoginPage';
import { NotFound } from '@/pages/NotFound';
import { ProtectedRoute } from '@/auth/ProtectedRoute';

import { DistributionList } from '@/pages/DistributionList';
import { DistributionWorkbench } from '@/pages/DistributionWorkbench';
import { ClinicalSchedule } from '@/pages/ClinicalSchedule';
import { SupervisorPortal } from '@/pages/SupervisorPortal';
import { DepartmentRoster } from '@/pages/DepartmentRoster';
import { TrainingSiteRoster } from '@/pages/TrainingSiteRoster';
import { ClinicalDashboard } from '@/pages/ClinicalDashboard';
import { ReportsDashboard } from '@/pages/ReportsDashboard';
import { DirectoryPage } from '@/pages/DirectoryPage';
import { StudentProfilePage } from '@/pages/StudentProfilePage';
import { StudentGroupsPage } from '@/pages/StudentGroupsPage';
import { StaffProfilePage } from '@/pages/StaffProfilePage';
import { StudyPlansPage } from '@/pages/StudyPlansPage';
import { StudyPlanDetailsPage } from '@/pages/StudyPlanDetailsPage';
import { CourseDetailsPage } from '@/pages/CourseDetailsPage';
import { GradesPage } from '@/pages/GradesPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { AssessmentsPage } from '@/pages/AssessmentsPage';
import { AdvisingPage } from '@/pages/AdvisingPage';
import { TasksPage } from '@/pages/TasksPage';
import { QualitySurveysPage } from '@/pages/QualitySurveysPage';
import { QualitySurveyDetailsPage } from '@/pages/QualitySurveyDetailsPage';
import { QualityImprovementPage } from '@/pages/QualityImprovementPage';
import { MeetingsPage } from '@/pages/MeetingsPage';
import { MeetingDetailsPage } from '@/pages/MeetingDetailsPage';
import { AcademicCalendarPage } from '@/pages/AcademicCalendarPage';
import { EvaluationFormsPage } from '@/pages/EvaluationFormsPage';
import { ExternalElectivesPage } from '@/pages/ExternalElectivesPage';
import { ResearchProjectsPage } from '@/pages/ResearchProjectsPage';
import { SkillLogbookPage } from '@/pages/SkillLogbookPage';
import { StaffAllocationsPage } from '@/pages/StaffAllocationsPage';
import { SupervisorWorkloadsPage } from '@/pages/SupervisorWorkloadsPage';
import { PartnershipsPage } from '@/pages/PartnershipsPage';
import { UsersPage } from '@/pages/UsersPage';
import { InboxPage } from '@/pages/InboxPage';
import { OutboxPage } from '@/pages/OutboxPage';
import { CorrespondenceDetailsPage } from '@/pages/CorrespondenceDetailsPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                <Route path="/" element={<FoundationHome />} />
                
                {/* Academic Affairs & Plans */}
                <Route path="/study-plans" element={<StudyPlansPage />} />
                <Route path="/study-plans/:planId" element={<StudyPlanDetailsPage />} />
                <Route path="/courses/:courseId" element={<CourseDetailsPage />} />
                <Route path="/grades" element={<GradesPage />} />
                
                {/* Students & Staff */}
                <Route path="/directory" element={<DirectoryPage kind="students" />} />
                <Route path="/students/:id" element={<StudentProfilePage />} />
                <Route path="/students/groups" element={<StudentGroupsPage />} />
                <Route path="/staff/:id" element={<StaffProfilePage />} />
                <Route path="/users" element={<UsersPage />} />

                {/* Distribution & Clinical */}
                <Route path="/distribution" element={<DistributionList />} />
                <Route path="/distribution/workbench" element={<DistributionWorkbench />} />
                <Route path="/clinical/schedule" element={<ClinicalSchedule />} />
                <Route path="/supervisor/portal" element={<SupervisorPortal />} />
                <Route path="/departments/:id/roster" element={<DepartmentRoster />} />
                <Route path="/training-sites/:id/roster" element={<TrainingSiteRoster />} />
                <Route path="/clinical/dashboard" element={<ClinicalDashboard />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/assessments" element={<AssessmentsPage />} />
                
                {/* Correspondence & Tasks */}
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/outbox" element={<OutboxPage />} />
                <Route path="/correspondence/:id" element={<CorrespondenceDetailsPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                
                {/* Quality & Management */}
                <Route path="/quality/surveys" element={<QualitySurveysPage />} />
                <Route path="/quality/surveys/:id" element={<QualitySurveyDetailsPage />} />
                <Route path="/quality/improvement" element={<QualityImprovementPage />} />
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/meetings/:id" element={<MeetingDetailsPage />} />
                <Route path="/academic/calendar" element={<AcademicCalendarPage />} />
                <Route path="/evaluations" element={<EvaluationFormsPage />} />
                <Route path="/operational/reports" element={<ReportsDashboard />} />
                
                {/* Misc */}
                <Route path="/advising" element={<AdvisingPage />} />
                <Route path="/external-electives" element={<ExternalElectivesPage />} />
                <Route path="/research-projects" element={<ResearchProjectsPage />} />
                <Route path="/skill-logbook" element={<SkillLogbookPage />} />
                <Route path="/staff-allocations" element={<StaffAllocationsPage />} />
                <Route path="/supervisor-workloads" element={<SupervisorWorkloadsPage />} />
                <Route path="/partnerships" element={<PartnershipsPage />} />
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </MainLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
