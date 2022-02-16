import * as schedule from 'node-schedule';
import * as pm2 from '@opendatacloudservices/local-pm2-config';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import type {Response} from 'express';

// get environmental variables
dotenv.config({path: path.join(__dirname, '../.env')});

import {api, catchAll} from '@opendatacloudservices/local-microservice';
import {
  logError,
  startTransaction,
  Transaction,
  localTokens,
  addToken,
  uuid,
  logInfo,
  tokenUrl,
} from '@opendatacloudservices/local-logger';

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

const orchestrationId = uuid();
logInfo({
  token: orchestrationId,
  message: 'orchestration started',
});

export const schedules: schedule.Job[] = [];
export const runJob = (
  app: App,
  trans: Transaction,
  res?: Response
): Promise<void> => {
  let url =
    `http://localhost:${app.port}` +
    `/${app.query.url}` +
    `${app.query.params.length > 0 ? '?' : ''}` +
    `${app.query.params
      .map(param => {
        return `${param.key}=${param.value}`;
      })
      .join('&')}`;

  if (res) {
    url = addToken(url, res);
  } else {
    if (url.indexOf('?') !== -1) {
      url += '&' + tokenUrl(orchestrationId);
    } else {
      url += '?' + tokenUrl(orchestrationId);
    }
  }

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
      trans(true, {message: 'success'});
      return Promise.resolve();
    })
    .catch(err => {
      logError(err);
      trans(false, {message: 'error'});
      return Promise.reject();
    });
};

const initTrans = startTransaction({
  type: 'system',
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
          type: 'schedule',
          name: app.name,
        });
        runJob(app, trans);
      })
    );
  });
  initTrans(true, {message: 'success'});
} catch (err) {
  logError({message: err});
  initTrans(false, {message: 'error'});
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
    ...localTokens(res),
    type: 'get',
    name: 'task/' + req.params.taskName,
  });
  if ('taskName' in req.params && req.params.taskName in taskMap) {
    await runJob(config[taskMap[req.params.taskName]], trans, res);
    res.status(200).json({message: 'Task called'});
  } else {
    const err = new Error(
      'task requires a param /task/:taskName that is included in the config: ' +
        req.params.taskName
    );
    res.status(500).json({error: err.message});
    logError(err);
    trans(false, {message: 'error'});
  }
});

catchAll();
