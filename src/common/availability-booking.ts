import { AppointmentStatus } from '@prisma/client';

// Müsaitlik slotuna bağlı randevunun özeti (Prisma include ile gelir)
export type SlotAppointment = { id: string; status: AppointmentStatus } | null;

export const SLOT_APPOINTMENT_SELECT = {
  select: { id: true, status: true },
} as const;

// İptal edilen randevu slotu serbest bırakmış sayılır
export function isSlotBooked(appointment: SlotAppointment): boolean {
  return (
    appointment !== null && appointment.status !== AppointmentStatus.CANCELLED
  );
}

// Slot kaydına booked (ve istenirse appointmentId) alanlarını ekler; diğer alanlar aynı kalır
export function withBookingState<T extends { appointment: SlotAppointment }>(
  slot: T,
  opts: { includeAppointmentId?: boolean } = {},
) {
  const { appointment, ...rest } = slot;
  const booked = isSlotBooked(appointment);
  return {
    ...rest,
    booked,
    ...(opts.includeAppointmentId && {
      appointmentId: booked && appointment ? appointment.id : null,
    }),
  };
}
