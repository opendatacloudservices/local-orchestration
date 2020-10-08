import * as schedule from 'node-schedule';
import * as pm2 from 'local-pm2-config';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// get environmental variables
dotenv.config({path: path.join(__dirname, '../.env')});

import {api, catchAll, logError, startTransaction} from 'local-microservice';

const config = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, process.env.CONFIG || 'config.json'),
    'utf8'
  )
);

export interface App {
  name: string;
  dayOfWeek: number[];
  hour: number;
  minute: number;
  service: string;
  port?: number;
  query: {
    url: string;
    params: {key: string; value: string}[];
  };
}

export const schedules: schedule.Job[] = [];
export const runJob = (
  app: App,
  trans: {end: (result: string) => void; id: () => string}
): Promise<void> => {
  const url =
    `http://localhost:${app.port}` +
    `/${app.query.url}` +
    `${app.query.params.length > 0 ? '?' : ''}` +
    `${app.query.params
      .map(param => {
        return `${param.key}=${param.value}`;
      })
      .join('&')}`;

  return fetch(url)
    .then(res => {
      if (res.status >= 200 && res.status < 300) {
        return res.json();
      } else {
        return Promise.reject(Error(res.statusText || res.status.toString()));
      }
    })
    .then(json => {
      // see log file
      console.log(new Date(), url, json);
      trans.end('success');
      return Promise.resolve();
    })
    .catch(err => {
      logError(err);
      trans.end('error');
      return Promise.reject();
    });
};

const initTrans = startTransaction({
  name: 'setup',
});

const taskMap: {[key: string]: number} = {};

try {
  config.forEach((app: App, index: number) => {
    taskMap[app.name] = index;

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

    app.port = port;

    schedules.push(
      schedule.scheduleJob(app.name, rule, () => {
        const trans = startTransaction({
          type: 'job',
          action: 'schedule',
          name: app.name,
        });
        runJob(app, trans);
      })
    );
  });
  initTrans.end('success');
} catch (err) {
  logError(err);
  initTrans.end('error');
}

/**
 * @swagger
 *
 * /task/{taskName}:
 *   get:
 *     operationId: getTask
 *     description: call a task by it's name
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: taskName
 *         description: name of task from config.json
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       500:
 *         description: error
 *       200:
 *         description: Drop completed
 */
api.get('/task/:taskName', async (req, res) => {
  const trans = startTransaction({
    type: 'job',
    action: 'get',
    name: req.params.taskName,
  });
  if ('taskName' in req.params && req.params.taskName in taskMap) {
    await runJob(config[taskMap[req.params.taskName]], trans);
    res.status(200).json({message: 'Task called'});
  } else {
    const err = new Error(
      'task requires a param /task/:taskName that is included in the config: ' +
        req.params.taskName
    );
    res.status(500).json({error: err.message});
    logError(err);
    trans.end('error');
  }
});

catchAll();
