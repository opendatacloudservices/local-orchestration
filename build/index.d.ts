import * as schedule from 'node-schedule';
import { Transaction } from 'local-logger';
export interface App {
    name: string;
    dayOfWeek: number[];
    hour: number;
    minute: number;
    service: string;
    port?: number;
    query: {
        url: string;
        params: {
            key: string;
            value: string;
        }[];
    };
}
export declare const schedules: schedule.Job[];
export declare const runJob: (app: App, trans: Transaction) => Promise<void>;
