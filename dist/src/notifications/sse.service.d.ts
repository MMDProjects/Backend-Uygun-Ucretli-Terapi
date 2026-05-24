import { Subject } from 'rxjs';
interface SseEvent {
    data: unknown;
    type?: string;
}
export declare class SseService {
    private clients;
    register(userId: string): Subject<SseEvent>;
    emit(userId: string, event: SseEvent): void;
    remove(userId: string): void;
}
export {};
