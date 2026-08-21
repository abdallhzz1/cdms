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
import { CoursesPage } from '@/pages/CoursesPage';
import { StudyPlanDetailsPage } from '@/pages/StudyPlanDetailsPage';
import { CourseDetailsPage } from '@/pages/CourseDetailsPage';
import { GradesPage } from '@/pages/GradesPage';
import { RtaAssignmentsPage } from '@/pages/RtaAssignmentsPage';
// New Clinical Module
import { DistributionPage } from '@/pages/clinical/DistributionPage';
import { ClinicalSchedulePage } from '@/pages/clinical/ClinicalSchedulePage';
import { AttendanceMasterPage } from '@/pages/clinical/AttendanceMasterPage';
import { AssessmentsMasterPage } from '@/pages/clinical/AssessmentsMasterPage';
import { SupervisorPortalPage } from '@/pages/clinical/SupervisorPortalPage';
import { DeptHeadProfilePage } from '@/pages/department/DeptHeadProfilePage';
import { AdvisingDashboardPage } from '@/pages/advising/AdvisingDashboardPage';
import { AdvisingAssignmentsPage } from '@/pages/advising/AdvisingAssignmentsPage';
import { EarlyWarningPage } from '@/pages/advising/EarlyWarningPage';
import { AdvisingFormsPage } from '@/pages/advising/AdvisingFormsPage';
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
import { ActiveSessionsPage } from '@/pages/admin/ActiveSessionsPage';
import { PermissionMatrixPage } from '@/pages/admin/PermissionMatrixPage';
import { SystemHealthPage } from '@/pages/admin/SystemHealthPage';
import { SystemSettingsPage } from '@/pages/admin/SystemSettingsPage';
import { InboxPage } from '@/pages/InboxPage';
import { OutboxPage } from '@/pages/OutboxPage';
import { CorrespondenceDetailsPage } from '@/pages/CorrespondenceDetailsPage';
import { PublicClinicalSchedulePage } from '@/pages/public/PublicClinicalSchedulePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/portal/clinical-schedule" element={<PublicClinicalSchedulePage />} />
      <Route path="/portal/student-lookup" element={<PublicClinicalSchedulePage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                <Route path="/" element={<FoundationHome />} />
                
                {/* Academic Affairs & Plans */}
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/study-plans" element={<CoursesPage />} />
                <Route path="/study-plans/:planId" element={<StudyPlanDetailsPage />} />
                <Route path="/courses/:courseId" element={<CourseDetailsPage />} />
                <Route path="/grades" element={<GradesPage />} />
                <Route path="/rta-assignments" element={<RtaAssignmentsPage />} />
                
                {/* Students & Staff */}
                <Route path="/directory" element={<DirectoryPage kind="students" />} />
                <Route path="/students/:id" element={<StudentProfilePage />} />
                <Route path="/students/groups" element={<StudentGroupsPage />} />
                <Route path="/staff/:id" element={<StaffProfilePage />} />

                {/* System Admin Routes (SYS_ADMIN Only) */}
                <Route 
                  path="/users" 
                  element={
                    <ProtectedRoute requiredPermission="users.view" requiredRole="SYS_ADMIN">
                      <UsersPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/audit-logs" 
                  element={
                    <ProtectedRoute requiredPermission="audit.view" requiredRole="SYS_ADMIN">
                      <AuditLogsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/sessions" 
                  element={
                    <ProtectedRoute requiredRole="SYS_ADMIN">
                      <ActiveSessionsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/permissions" 
                  element={
                    <ProtectedRoute requiredRole="SYS_ADMIN">
                      <PermissionMatrixPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/health" 
                  element={
                    <ProtectedRoute requiredRole="SYS_ADMIN">
                      <SystemHealthPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/settings" 
                  element={
                    <ProtectedRoute requiredRole="SYS_ADMIN">
                      <SystemSettingsPage />
                    </ProtectedRoute>
                  } 
                />

                {/* Clinical Training Module */}
                <Route path="/distribution" element={<DistributionPage />} />
                <Route path="/distribution/workbench" element={<DistributionWorkbench />} />
                <Route path="/distribution/workbench/:versionId" element={<DistributionWorkbench />} />
                <Route path="/distribution/:siteId" element={<TrainingSiteRoster />} />
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

                <Route path="/evaluations" element={<EvaluationFormsPage />} />
                <Route path="/operational/reports" element={<ReportsDashboard />} />
                
                {/* Misc */}
                {/* Advising */}
                <Route path="/advising" element={<AdvisingDashboardPage />} />
                <Route path="/advising/assignments" element={<AdvisingAssignmentsPage />} />
                <Route path="/advising/forms" element={<AdvisingFormsPage />} />
                <Route path="/advising/logs" element={<AdvisingFormsPage />} />
                <Route path="/advising/early-warning" element={<EarlyWarningPage />} />
                <Route path="/external-electives" element={<ExternalElectivesPage />} />
                <Route path="/research-projects" element={<ResearchProjectsPage />} />
                <Route path="/skill-logbook" element={<SkillLogbookPage />} />
                <Route path="/staff-allocations" element={<StaffAllocationsPage />} />
                <Route path="/dept-heads/:id" element={<DeptHeadProfilePage />} />
                <Route path="/dept-heads/me" element={<DeptHeadProfilePage />} />
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
