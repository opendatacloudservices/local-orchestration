"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runJob = exports.schedules = void 0;
const schedule = require("node-schedule");
const pm2 = require("local-pm2-config");
const node_fetch_1 = require("node-fetch");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
// get environmental variables
dotenv.config({ path: path.join(__dirname, '../.env') });
const local_microservice_1 = require("local-microservice");
const config = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.CONFIG || 'config.json'), 'utf8'));
exports.schedules = [];
exports.runJob = (app, trans) => {
    const url = `http://localhost:${app.port}` +
        `/${app.query.url}` +
        `${app.query.params.length > 0 ? '?' : ''}` +
        `${app.query.params
            .map(param => {
            return `${param.key}=${param.value}`;
        })
            .join('&')}`;
    return node_fetch_1.default(url)
        .then(res => {
        if (res.status >= 200 && res.status < 300) {
            return res.json();
        }
        else {
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
        local_microservice_1.logError(err);
        trans.end('error');
        return Promise.reject();
    });
};
const initTrans = local_microservice_1.startTransaction({
    name: 'setup',
});
const taskMap = {};
try {
    config.forEach((app, index) => {
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
        exports.schedules.push(schedule.scheduleJob(app.name, rule, () => {
            const trans = local_microservice_1.startTransaction({
                type: 'job',
                action: 'schedule',
                name: app.name,
            });
            exports.runJob(app, trans);
        }));
    });
    initTrans.end('success');
}
catch (err) {
    local_microservice_1.logError(err);
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
local_microservice_1.api.get('/task/:taskName', async (req, res) => {
    const trans = local_microservice_1.startTransaction({
        type: 'job',
        action: 'get',
        name: req.params.taskName,
    });
    if ('taskName' in req.params && req.params.taskName in taskMap) {
        await exports.runJob(config[taskMap[req.params.taskName]], trans);
        res.status(200).json({ message: 'Task called' });
    }
    else {
        const err = new Error('task requires a param /task/:taskName that is included in the config: ' +
            req.params.taskName);
        res.status(500).json({ error: err.message });
        local_microservice_1.logError(err);
        trans.end('error');
    }
});
local_microservice_1.catchAll();
//# sourceMappingURL=index.js.map