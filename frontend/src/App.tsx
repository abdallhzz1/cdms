import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { FoundationHome } from '@/pages/FoundationHome';
import { LoginPage } from '@/pages/LoginPage';
import { NotFound } from '@/pages/NotFound';
import { ProtectedRoute } from '@/auth/ProtectedRoute';

import { DistributionWorkbench } from '@/pages/DistributionWorkbench';
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
// New Clinical Module
import { DistributionPage } from '@/pages/clinical/DistributionPage';
import { ClinicalSchedulePage } from '@/pages/clinical/ClinicalSchedulePage';
import { AttendanceMasterPage } from '@/pages/clinical/AttendanceMasterPage';
import { AssessmentsMasterPage } from '@/pages/clinical/AssessmentsMasterPage';
import { SupervisorPortalPage } from '@/pages/clinical/SupervisorPortalPage';
import { AdvisingDashboardPage } from '@/pages/advising/AdvisingDashboardPage';
import { AdvisingAssignmentsPage } from '@/pages/advising/AdvisingAssignmentsPage';
import { AdvisingLogsPage } from '@/pages/advising/AdvisingLogsPage';
import { EarlyWarningPage } from '@/pages/advising/EarlyWarningPage';
import { TasksPage } from '@/pages/TasksPage';
// New Quality Module
import { QualityDashboardPage } from '@/pages/quality/QualityDashboardPage';
import { SurveysPage } from '@/pages/quality/SurveysPage';
import { SurveyDetailsPage } from '@/pages/quality/SurveyDetailsPage';
import { ImprovementPlansPage } from '@/pages/quality/ImprovementPlansPage';
import { KpiPage } from '@/pages/quality/KpiPage';
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
import { AuditLogsPage } from '@/pages/AuditLogsPage';
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

                {/* Clinical Training Module */}
                <Route path="/distribution" element={<DistributionPage />} />
                <Route path="/distribution/workbench" element={<DistributionWorkbench />} />
                <Route path="/clinical/schedule" element={<ClinicalSchedulePage />} />
                <Route path="/supervisor/portal" element={<SupervisorPortalPage />} />
                <Route path="/departments/:id/roster" element={<DepartmentRoster />} />
                <Route path="/training-sites/:id/roster" element={<TrainingSiteRoster />} />
                <Route path="/clinical/dashboard" element={<ClinicalDashboard />} />
                <Route path="/attendance" element={<AttendanceMasterPage />} />
                <Route path="/assessments" element={<AssessmentsMasterPage />} />
                
                {/* Correspondence & Tasks */}
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/outbox" element={<OutboxPage />} />
                <Route path="/correspondence/:id" element={<CorrespondenceDetailsPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                
                {/* Quality Module */}
                <Route path="/quality" element={<QualityDashboardPage />} />
                <Route path="/quality/surveys" element={<SurveysPage />} />
                <Route path="/quality/surveys/:id" element={<SurveyDetailsPage />} />
                <Route path="/quality/improvement" element={<ImprovementPlansPage />} />
                <Route path="/quality/kpis" element={<KpiPage />} />
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/meetings/:id" element={<MeetingDetailsPage />} />
                <Route path="/academic/calendar" element={<AcademicCalendarPage />} />
                <Route path="/audit-logs" element={<AuditLogsPage />} />
                <Route path="/evaluations" element={<EvaluationFormsPage />} />
                <Route path="/operational/reports" element={<ReportsDashboard />} />
                
                {/* Misc */}
                {/* Advising */}
                <Route path="/advising" element={<AdvisingDashboardPage />} />
                <Route path="/advising/assignments" element={<AdvisingAssignmentsPage />} />
                <Route path="/advising/logs" element={<AdvisingLogsPage />} />
                <Route path="/advising/early-warning" element={<EarlyWarningPage />} />
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
