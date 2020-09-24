process.env.CONFIG = '../test/config.json'

const orchestration = require('../build/index');

test('loading of schedules from json', () => {
  expect(orchestration).toHaveProperty('schedules');
  expect(orchestration.schedules.length).toEqual(1);
  expect(orchestration.schedules[0].name).toEqual('local-ckan-harvester/process_all');
})

// TODO: Test if a job is fired??