/**
 * Trigger execution logic for the Timetable Trigger node
 */

import moment from 'moment-timezone';
import { shouldTriggerNow, getNextRunTime, createResultData } from './GenericFunctions';

import type {
	HourConfig,
	StaticData,
	NodeHelpers
} from './SchedulerInterface';

/**
 * Create the execution trigger function that will be called by the cron scheduler
 * @param params - Object containing all required parameters
 * @returns Function that handles the trigger execution logic
 */
export const createExecuteTrigger = (hourConfigs: HourConfig[], timezone: string, staticData: StaticData, helpers: NodeHelpers, logger: any) => {
	return (emitCallback: (data: any) => void) => {
		try {
			const currentTime = moment.tz(timezone).toDate();
			const shouldTrigger = shouldTriggerNow(staticData.lastTriggerTime, hourConfigs, timezone);
			
			const currentTimeUtc = moment.utc(currentTime);
			logger.debug(`Trigger check at ${currentTimeUtc.format('YYYY-MM-DD HH:mm:ss')} UTC (${currentTime.toISOString()})`);
			logger.debug(`Current time in timezone ${timezone}: ${moment.tz(timezone).format('YYYY-MM-DD HH:mm:ss')}`);
			logger.debug(`Last trigger time: ${staticData.lastTriggerTime ? new Date(staticData.lastTriggerTime).toISOString() : 'never'}`);
			logger.debug(`Should trigger: ${shouldTrigger}`);
			
			if (!shouldTrigger) {
				try {
					const nextRun = getNextRunTime(currentTime, hourConfigs);
					logger.debug(`Not triggering. Next scheduled: ${moment.utc(nextRun.candidate).format('YYYY-MM-DD HH:mm:ss')} UTC`);
				} catch (error) {
					logger.error(`Error computing next run time for skip: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
				return;
			}

			logger.info(`✓ TRIGGERING WORKFLOW at ${moment.utc(currentTime).format('YYYY-MM-DD HH:mm:ss')} UTC`);
			staticData.lastTriggerTime = Date.now();
			
			try {
				const momentTz = moment.tz(timezone);
				const nextRun = getNextRunTime(momentTz.toDate(), hourConfigs);
				const resultData = createResultData(momentTz, timezone, hourConfigs, nextRun, false);
				emitCallback([helpers.returnJsonArray([resultData])]);
			} catch (error) {
				logger.error(`Error creating workflow output: ${error instanceof Error ? error.message : 'Unknown error'}`);
				const momentTz = moment.tz(timezone);
				const fallbackData = { 
					timestamp: momentTz.toISOString(true),
					'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
					'Readable time': momentTz.format('h:mm:ss a'),
					'Manual execution': false,
					error: 'Failed to compute next run time - workflow executed with fallback data'
				};
				emitCallback([helpers.returnJsonArray([fallbackData])]);
			}
		} catch (error) {
			logger.error(`Error in execution trigger: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	};
};