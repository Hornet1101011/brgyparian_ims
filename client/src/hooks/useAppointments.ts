import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import appointmentsAPI from '../api/appointments';
import type { AppointmentInquiry, ScheduledAppointment } from '../types/appointments';

export function useAppointmentsQuery() {
  return useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      return appointmentsAPI.getAppointmentInquiries();
    },
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useAppointmentDetailsQuery(inquiryId?: string) {
  return useQuery({
    queryKey: ['appointment', inquiryId],
    queryFn: async () => {
      if (!inquiryId) return null;
      return appointmentsAPI.getAppointmentDetails(inquiryId);
    },
    enabled: !!inquiryId,
    refetchOnWindowFocus: true,
    staleTime: 1000 * 30,
  });
}

export function useSubmitScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scheduledDates }: { id: string; scheduledDates: ScheduledAppointment[] }) => {
      return appointmentsAPI.scheduleAppointment({ id, scheduledDates });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      if (variables && variables.id) qc.invalidateQueries({ queryKey: ['appointment', variables.id] });
    }
  });
}
