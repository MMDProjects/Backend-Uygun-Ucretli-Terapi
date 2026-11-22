import { AppointmentStatus } from '@prisma/client';
import { isSlotBooked, withBookingState } from './availability-booking';

describe('availability-booking', () => {
  it('bağlı randevu yoksa slot boştur', () => {
    expect(isSlotBooked(null)).toBe(false);
  });

  it('SCHEDULED, COMPLETED ve NO_SHOW randevular slotu doludur', () => {
    expect(isSlotBooked({ id: 'a', status: AppointmentStatus.SCHEDULED })).toBe(
      true,
    );
    expect(isSlotBooked({ id: 'a', status: AppointmentStatus.COMPLETED })).toBe(
      true,
    );
    expect(isSlotBooked({ id: 'a', status: AppointmentStatus.NO_SHOW })).toBe(
      true,
    );
  });

  it('CANCELLED randevu slotu serbest bırakır', () => {
    expect(isSlotBooked({ id: 'a', status: AppointmentStatus.CANCELLED })).toBe(
      false,
    );
  });

  it('booked alanını ekler ve mevcut alanları korur', () => {
    const slot = {
      id: 's1',
      date: new Date('2026-11-10T00:00:00Z'),
      startTime: '10:00',
      endTime: '10:45',
      isBlockedByAdmin: false,
      expertProfileId: 'e1',
      appointment: { id: 'appt-1', status: AppointmentStatus.SCHEDULED },
    };

    const view = withBookingState(slot);

    expect(view).toEqual({
      id: 's1',
      date: slot.date,
      startTime: '10:00',
      endTime: '10:45',
      isBlockedByAdmin: false,
      expertProfileId: 'e1',
      booked: true,
    });
    expect(view).not.toHaveProperty('appointment');
    expect(view).not.toHaveProperty('appointmentId');
  });

  it('admin görünümünde appointmentId döner, boş slotta null', () => {
    const booked = withBookingState(
      {
        id: 's1',
        appointment: { id: 'appt-1', status: AppointmentStatus.NO_SHOW },
      },
      { includeAppointmentId: true },
    );
    const free = withBookingState(
      { id: 's2', appointment: null },
      { includeAppointmentId: true },
    );
    const cancelled = withBookingState(
      {
        id: 's3',
        appointment: { id: 'appt-2', status: AppointmentStatus.CANCELLED },
      },
      { includeAppointmentId: true },
    );

    expect(booked).toMatchObject({ booked: true, appointmentId: 'appt-1' });
    expect(free).toMatchObject({ booked: false, appointmentId: null });
    expect(cancelled).toMatchObject({ booked: false, appointmentId: null });
  });
});
