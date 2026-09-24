import { Navigate, useLocation } from 'react-router-dom';

/** Keep old bookmarks working while QR is the only supervisor attendance workflow. */
export function SupervisorAttendancePage() {
  const { search } = useLocation();
  return <Navigate to={`/supervisor/attendance/qr${search}`} replace />;
}
