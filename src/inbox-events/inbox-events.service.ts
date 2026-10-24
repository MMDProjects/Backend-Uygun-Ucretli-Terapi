import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface InboxEvent {
  type: string;
  data: unknown;
}

@Injectable()
export class InboxEventsService {
  private readonly subject = new Subject<InboxEvent>();

  emit(type: string, data: unknown): void {
    this.subject.next({ type, data });
  }

  stream(): Observable<InboxEvent> {
    return this.subject.asObservable();
  }
}
