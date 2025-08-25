/**
 * Trigger execution logic for the Timetable Trigger node
 */

import moment from 'moment-timezone';
import { shouldTriggerNow, getNextRunTime, createResultData } from './GenericFunctions';
import { createTimetableLogger } from './LoggingHelpers';

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
	const timetableLogger = createTimetableLogger(logger);
	
	return (emitCallback: (data: any) => void) => {
		try {
			const currentTime = moment.tz(timezone).toDate();
			const shouldTrigger = shouldTriggerNow(staticData.lastTriggerTime, hourConfigs, timezone);
			
			timetableLogger.logTriggerCheck(currentTime, timezone, staticData.lastTriggerTime, shouldTrigger);
			
			if (!shouldTrigger) {
				try {
					const nextRun = getNextRunTime(currentTime, hourConfigs);
					timetableLogger.logSkipTrigger(nextRun);
				} catch (error) {
					timetableLogger.logSkipTriggerError(error);
				}
				return;
			}

			timetableLogger.logWorkflowTrigger(currentTime);
			staticData.lastTriggerTime = Date.now();
			
			try {
				const momentTz = moment.tz(timezone);
				const nextRun = getNextRunTime(momentTz.toDate(), hourConfigs);
				const resultData = createResultData(momentTz, timezone, hourConfigs, nextRun, false);
				emitCallback([helpers.returnJsonArray([resultData])]);
			} catch (error) {
				timetableLogger.logWorkflowOutputError(error);
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
			timetableLogger.logExecutionTriggerError(error);
		}
	};
};