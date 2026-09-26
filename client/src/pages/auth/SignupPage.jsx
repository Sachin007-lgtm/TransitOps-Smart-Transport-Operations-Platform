import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Public registration is disabled in TransitOps.
 * Accounts are provisioned exclusively through controlled platform-admin
 * and owner/manager workflows.
 */
export default function SignupPage() {
  return <Navigate to="/login" replace />;
}
