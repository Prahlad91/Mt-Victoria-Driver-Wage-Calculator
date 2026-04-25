export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export interface SimpleUploadState<T> {
  status: UploadStatus;
  result: T | null;
  error: string | null;
  cached?: boolean;  // true when restored from localStorage
}

export interface RosterUploadState {
  status: UploadStatus; result: import('./index').ParseRosterResponse | null;
  error: string | null; applied: boolean;
}

export interface PayslipUploadState {
  status: UploadStatus; result: import('./index').ParsePayslipResponse | null; error: string | null;
}
