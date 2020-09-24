import * as schedule from 'node-schedule';
export declare const schedules: schedule.Job[];
export declare const scheduleMessages: {
    [key: string]: {
        time: Date;
        url: string;
        message: string;
    }[];
};
