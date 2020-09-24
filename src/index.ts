import * as schedule from 'node-schedule';
import * as pm2 from 'local-pm2-config';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// get environmental variables
dotenv.config({path: path.join(__dirname, '../.env')});

const config = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, process.env.CONFIG || 'config.json'),
    'utf8'
  )
);

export const schedules: schedule.Job[] = [];

config.forEach(
  (app: {
    name: string;
    dayOfWeek: number[];
    hour: number;
    minute: number;
    service: string;
    query: {
      url: string;
      params: {key: string; value: string}[];
    };
  }) => {
    const rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = app.dayOfWeek;
    rule.hour = app.hour;
    rule.minute = app.minute;

    let port = 0;
    pm2.apps.forEach(configApp => {
      if (configApp.name === app.service) {
        port = configApp.env.PORT;
      }
    });

    if (port === 0) {
      console.error(`Could not find port number for app: ${app.name}`, pm2);
    }

    schedules.push(
      schedule.scheduleJob(app.name, rule, () => {
        const url =
          `localhost:${port}` +
          `/${app.query.url}` +
          `${app.query.params.length > 0 ? '?' : ''}` +
          `${app.query.params
            .map(param => {
              return `${param.key}=${param.value}`;
            })
            .join('&')}`;

        fetch(url)
          .then(res => {
            if (res.status >= 200 && res.status < 300) {
              return res.json();
            } else {
              return Promise.reject(
                Error(res.statusText || res.status.toString())
              );
            }
          })
          .then(json => {
            console.log(new Date(), url, json);
          })
          .catch(err => {
            console.error(err);
          });
      })
    );
  }
);
