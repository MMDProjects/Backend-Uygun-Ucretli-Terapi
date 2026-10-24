import { InboxEventsService } from './inbox-events.service';

describe('InboxEventsService', () => {
  it('emit edilen olayı stream aboneliğine iletir', () => {
    const service = new InboxEventsService();
    const received: unknown[] = [];
    const sub = service.stream().subscribe((event) => received.push(event));

    service.emit('counts.changed', {});
    service.emit('message.created', { conversationId: 'conv-1' });

    expect(received).toEqual([
      { type: 'counts.changed', data: {} },
      { type: 'message.created', data: { conversationId: 'conv-1' } },
    ]);
    sub.unsubscribe();
  });

  it('abonelik kapandıktan sonra olay almaz', () => {
    const service = new InboxEventsService();
    const handler = jest.fn();
    const sub = service.stream().subscribe(handler);
    sub.unsubscribe();

    service.emit('counts.changed', {});

    expect(handler).not.toHaveBeenCalled();
  });
});
