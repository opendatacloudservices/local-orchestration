"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedules = void 0;
const schedule = require("node-schedule");
const pm2 = require("local-pm2-config");
const node_fetch_1 = require("node-fetch");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
// get environmental variables
dotenv.config({ path: path.join(__dirname, '../.env') });
const config = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.CONFIG || 'config.json'), 'utf8'));
exports.schedules = [];
config.forEach((app) => {
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
    exports.schedules.push(schedule.scheduleJob(app.name, rule, () => {
        const url = `localhost:${port}` +
            `/${app.query.url}` +
            `${app.query.params.length > 0 ? '?' : ''}` +
            `${app.query.params
                .map(param => {
                return `${param.key}=${param.value}`;
            })
                .join('&')}`;
        node_fetch_1.default(url)
            .then(res => {
            if (res.status >= 200 && res.status < 300) {
                return res.json();
            }
            else {
                return Promise.reject(Error(res.statusText || res.status.toString()));
            }
        })
            .then(json => {
            console.log(new Date(), url, json);
        })
            .catch(err => {
            console.error(err);
        });
    }));
});
//# sourceMappingURL=index.js.map