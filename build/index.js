"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runJob = exports.schedules = void 0;
const schedule = require("node-schedule");
const pm2 = require("@opendatacloudservices/local-pm2-config");
const node_fetch_1 = require("node-fetch");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
// get environmental variables
dotenv.config({ path: path.join(__dirname, '../.env') });
const local_microservice_1 = require("@opendatacloudservices/local-microservice");
const local_logger_1 = require("@opendatacloudservices/local-logger");
const config = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.CONFIG || 'config.json'), 'utf8'));
const orchestrationId = (0, local_logger_1.uuid)();
(0, local_logger_1.logInfo)({
    token: orchestrationId,
    message: 'orchestration started',
});
exports.schedules = [];
const runJob = (app, trans, res) => {
    let url = `http://localhost:${app.port}` +
        `/${app.query.url}` +
        `${app.query.params.length > 0 ? '?' : ''}` +
        `${app.query.params
            .map(param => {
            return `${param.key}=${param.value}`;
        })
            .join('&')}`;
    if (res) {
        url = (0, local_logger_1.addToken)(url, res);
    }
    else {
        if (url.indexOf('?') !== -1) {
            url += '&' + (0, local_logger_1.tokenUrl)(orchestrationId);
        }
        else {
            url += '?' + (0, local_logger_1.tokenUrl)(orchestrationId);
        }
    }
    return (0, node_fetch_1.default)(url)
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
        trans(true, { message: 'success' });
        return Promise.resolve();
    })
        .catch(err => {
        (0, local_logger_1.logError)(err);
        trans(false, { message: 'error' });
        return Promise.reject();
    });
};
exports.runJob = runJob;
const initTrans = (0, local_logger_1.startTransaction)({
    type: 'system',
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
            const trans = (0, local_logger_1.startTransaction)({
                type: 'schedule',
                name: app.name,
            });
            (0, exports.runJob)(app, trans);
        }));
    });
    initTrans(true, { message: 'success' });
}
catch (err) {
    (0, local_logger_1.logError)({ message: err });
    initTrans(false, { message: 'error' });
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
    const trans = (0, local_logger_1.startTransaction)({
        ...(0, local_logger_1.localTokens)(res),
        type: 'get',
        name: 'task/' + req.params.taskName,
    });
    if ('taskName' in req.params && req.params.taskName in taskMap) {
        await (0, exports.runJob)(config[taskMap[req.params.taskName]], trans, res);
        res.status(200).json({ message: 'Task called' });
    }
    else {
        const err = new Error('task requires a param /task/:taskName that is included in the config: ' +
            req.params.taskName);
        res.status(500).json({ error: err.message });
        (0, local_logger_1.logError)(err);
        trans(false, { message: 'error' });
    }
});
(0, local_microservice_1.catchAll)();
//# sourceMappingURL=index.js.map