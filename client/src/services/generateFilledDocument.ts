// Generate filled document for a document request (staff action)
import { axiosInstance } from './api';

export async function generateFilledDocument(requestId: string) {
  const response = await axiosInstance.post(`/document-requests/${requestId}/generate-filled`);
  return response.data;
}
