import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

interface SseEvent {
  data: unknown;
  type?: string;
}

@Injectable()
export class SseService {
  private clients = new Map<string, Subject<SseEvent>>();

  register(userId: string): Subject<SseEvent> {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Subject<SseEvent>());
    }
    return this.clients.get(userId)!;
  }

  emit(userId: string, event: SseEvent) {
    this.clients.get(userId)?.next(event);
  }

  remove(userId: string) {
    this.clients.get(userId)?.complete();
    this.clients.delete(userId);
  }
}
