/**
 * Trigger execution logic for the Timetable Trigger node
 */

import moment from 'moment-timezone';
import { shouldTriggerNow, getNextRunTime, createResultData } from './GenericFunctions';

import type { 
	TimetableConfig, 
	RawHourConfig, 
	StaticData,
	NodeHelpers 
} from './SchedulerInterface';

/**
 * Create the execution trigger function that will be called by the cron scheduler
 * @param config - Timetable configuration with hour configs
 * @param timezone - Target timezone for execution
 * @param staticData - Workflow static data for tracking last trigger time
 * @param hourConfigs - Raw hour configurations for result data
 * @param emit - Function to emit workflow data
 * @param helpers - Node helpers for data transformation
 * @param logger - Logger instance for debugging and info
 * @returns Function that handles the trigger execution logic
 */
export const createExecuteTrigger = (
	config: TimetableConfig, 
	timezone: string, 
	staticData: StaticData, 
	hourConfigs: RawHourConfig[],
	emit: (data: any) => void,
	helpers: NodeHelpers,
	logger: any
) => {
	return () => {
		try {
			const currentTime = moment.tz(timezone).toDate();
			const shouldTrigger = shouldTriggerNow(staticData.lastTriggerTime, config, timezone);
			
			const currentTimeUtc = moment.utc(currentTime);
			logger.debug(`Trigger check at ${currentTimeUtc.format('YYYY-MM-DD HH:mm:ss')} UTC (${currentTime.toISOString()})`);
			logger.debug(`Current time in timezone ${timezone}: ${moment.tz(timezone).format('YYYY-MM-DD HH:mm:ss')}`);
			logger.debug(`Last trigger time: ${staticData.lastTriggerTime ? new Date(staticData.lastTriggerTime).toISOString() : 'never'}`);
			logger.debug(`Should trigger: ${shouldTrigger}`);
			
			if (!shouldTrigger) {
				try {
					const nextRun = getNextRunTime(currentTime, config);
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
				const nextRun = getNextRunTime(momentTz.toDate(), config);
				const resultData = createResultData(momentTz, timezone, hourConfigs, nextRun, false);
				emit([helpers.returnJsonArray([resultData])]);
			} catch (error) {
				logger.error(`Error creating workflow output: ${error instanceof Error ? error.message : 'Unknown error'}`);
				// Emit minimal data without next run time to ensure workflow still executes
				const momentTz = moment.tz(timezone);
				const fallbackData = { 
					timestamp: momentTz.toISOString(true),
					'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
					'Readable time': momentTz.format('h:mm:ss a'),
					'Manual execution': false,
					error: 'Failed to compute next run time - workflow executed with fallback data'
				};
				emit([helpers.returnJsonArray([fallbackData])]);
			}
		} catch (error) {
			logger.error(`Error in execution trigger: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	};
};