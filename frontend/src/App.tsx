import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { FoundationHome } from '@/pages/FoundationHome';
import { LoginPage } from '@/pages/LoginPage';
import { NotFound } from '@/pages/NotFound';
import { ProtectedRoute } from '@/auth/ProtectedRoute';

import { ClinicalDashboard } from '@/pages/ClinicalDashboard';
import { ReportsDashboard } from '@/pages/ReportsDashboard';
import { DirectoryPage } from '@/pages/DirectoryPage';
import { StudentProfilePage } from '@/pages/StudentProfilePage';
import { StudentGroupsPage } from '@/pages/StudentGroupsPage';
import { StaffProfilePage } from '@/pages/StaffProfilePage';
import { MyProfilePage } from '@/pages/MyProfilePage';
import { CoursesPage } from '@/pages/CoursesPage';
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
import { ClinicalSupervisorsDirectoryPage } from '@/pages/clinical/ClinicalSupervisorsDirectoryPage';
import { ClinicalSupervisorProfilePage } from '@/pages/clinical/ClinicalSupervisorProfilePage';
import { AdvisingDashboardPage } from '@/pages/advising/AdvisingDashboardPage';
import { AdvisingAssignmentsPage } from '@/pages/advising/AdvisingAssignmentsPage';
import { EarlyWarningPage } from '@/pages/advising/EarlyWarningPage';
import { AdvisingFormsPage } from '@/pages/advising/AdvisingFormsPage';
import { AdvisingLogsPage } from '@/pages/advising/AdvisingLogsPage';
import { AdvisingDetailsPage } from '@/pages/AdvisingDetailsPage';
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
import { PartnershipsPage } from '@/pages/PartnershipsPage';
import { UsersPage } from '@/pages/UsersPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { ActiveSessionsPage } from '@/pages/admin/ActiveSessionsPage';
import { PermissionMatrixPage } from '@/pages/admin/PermissionMatrixPage';
import { DepartmentsManagementPage } from '@/pages/admin/DepartmentsManagementPage';
import { SystemHealthPage } from '@/pages/admin/SystemHealthPage';
import { SystemSettingsPage } from '@/pages/admin/SystemSettingsPage';
import { InboxPage } from '@/pages/InboxPage';
import { OutboxPage } from '@/pages/OutboxPage';
import { CorrespondenceDetailsPage } from '@/pages/CorrespondenceDetailsPage';
import { PublicClinicalSchedulePage } from '@/pages/public/PublicClinicalSchedulePage';
import { PublicStudentRegistrationPage } from '@/pages/PublicStudentRegistrationPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/public/student-registration" element={<PublicStudentRegistrationPage />} />
      <Route path="/student-registration" element={<PublicStudentRegistrationPage />} />
      <Route path="/student-registration/:publicId" element={<PublicStudentRegistrationPage />} />
      <Route path="/public/student-registration/:publicId" element={<PublicStudentRegistrationPage />} />
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
                <Route path="/study-plans/*" element={<Navigate to="/courses" replace />} />
                <Route path="/courses/:courseId" element={<CourseDetailsPage />} />
                <Route path="/grades" element={<GradesPage />} />
                <Route path="/rta-assignments" element={<ProtectedRoute requiredPermission="rta_assignments.manage"><RtaAssignmentsPage /></ProtectedRoute>} />
                
                {/* Students & Staff */}
                <Route path="/directory" element={<DirectoryPage kind="students" />} />
                <Route path="/students/:id" element={<StudentProfilePage />} />
                <Route path="/students/groups" element={<StudentGroupsPage />} />
                <Route path="/distribution/groups" element={<StudentGroupsPage />} />
                <Route path="/staff/:id" element={<StaffProfilePage />} />
                <Route path="/profile" element={<MyProfilePage />} />

                {/* Technical administration screens are governed by the same
                    permissions exposed in the admin matrix. */}
                <Route 
                  path="/users" 
                  element={
                    <ProtectedRoute requiredPermission="users.manage">
                      <UsersPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/audit-logs" 
                  element={
                    <ProtectedRoute requiredPermission="audit.view">
                      <AuditLogsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/sessions" 
                  element={
                    <ProtectedRoute requiredPermission="users.manage">
                      <ActiveSessionsPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/permissions" 
                  element={
                    <ProtectedRoute requiredPermission="roles.manage">
                      <PermissionMatrixPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/departments" 
                  element={
                    <ProtectedRoute requiredPermission="users.manage">
                      <DepartmentsManagementPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/health" 
                  element={
                    <ProtectedRoute requiredPermission="settings.manage">
                      <SystemHealthPage />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/settings" 
                  element={
                    <ProtectedRoute requiredPermission="settings.manage">
                      <SystemSettingsPage />
                    </ProtectedRoute>
                  } 
                />

                {/* Clinical Training Module */}
                <Route path="/distribution" element={<DistributionPage />} />
                {/* Legacy workbench routes -> redirect to DistributionPage (which has full workbench) */}
                <Route path="/distribution/workbench" element={<DistributionPage />} />
                <Route path="/distribution/workbench/:versionId" element={<DistributionPage />} />
                {/* Legacy roster routes -> redirect to clinical schedule */}
                <Route path="/distribution/:siteId" element={<Navigate to="/clinical/schedule" replace />} />
                <Route path="/clinical/schedule" element={<ProtectedRoute requiredPermission="clinical_schedule.view"><ClinicalSchedulePage /></ProtectedRoute>} />
                <Route path="/supervisor/portal" element={<SupervisorPortalPage />} />
                {/* Legacy roster routes -> redirect to clinical schedule */}
                <Route path="/departments/:id/roster" element={<Navigate to="/clinical/schedule" replace />} />
                <Route path="/training-sites/:id/roster" element={<Navigate to="/clinical/schedule" replace />} />
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
                <Route path="/advising/logs" element={<AdvisingLogsPage />} />
                <Route path="/advising/records/:id" element={<AdvisingDetailsPage />} />
                <Route path="/advising/early-warning" element={<EarlyWarningPage />} />
                <Route path="/external-electives" element={<ExternalElectivesPage />} />
                <Route path="/research-projects" element={<ResearchProjectsPage />} />
                <Route path="/skill-logbook" element={<SkillLogbookPage />} />
                <Route path="/department-heads" element={<StaffAllocationsPage />} />
                <Route path="/staff-allocations" element={<Navigate to="/department-heads" replace />} />
                <Route path="/dept-heads/:id" element={<DeptHeadProfilePage />} />
                <Route path="/dept-heads/me" element={<DeptHeadProfilePage />} />
                
                <Route path="/clinical-supervisors" element={<ClinicalSupervisorsDirectoryPage />} />
                <Route path="/clinical-supervisors/me" element={<ClinicalSupervisorProfilePage />} />
                <Route path="/clinical-supervisors/:id" element={<ClinicalSupervisorProfilePage />} />
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
